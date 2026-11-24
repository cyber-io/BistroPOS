using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class ReservationService(RestaurantDbContext db, IOptions<BusinessRulesOptions> rules,
    INotificationService notifications, IAuditLogService audit) : IReservationService
{
    private static readonly string[] ActiveStatuses = [ReservationStatuses.Confirmed,ReservationStatuses.Arrived,ReservationStatuses.Seated,ReservationStatuses.Rescheduled];
    private static DateTime LocalNow
    {
        get
        {
            try { return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("Asia/Kolkata")); }
            catch {
                try { return TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow, TimeZoneInfo.FindSystemTimeZoneById("India Standard Time")); }
                catch { return DateTime.Now; }
            }
        }
    }
    private async Task<(TimeOnly Open,TimeOnly Close)> Hours(Guid restaurantId,DateOnly date)
    {
        var restaurant=await db.Restaurants.FindAsync(restaurantId) ?? throw new ArgumentException("Restaurant not found.");
        try {
            using var json=JsonDocument.Parse(restaurant.OpeningHours);
            var day=json.RootElement.GetProperty(date.DayOfWeek.ToString().ToLowerInvariant());
            return (TimeOnly.Parse(day.GetProperty("open").GetString()!),TimeOnly.Parse(day.GetProperty("close").GetString()!));
        } catch { return (new(11,0),new(22,0)); }
    }
    private async Task ValidateSlot(Guid restaurantId,DateOnly date,TimeOnly time,int guests)
    {
        if(guests<1||guests>70)throw new ArgumentException("Party size must be between 1 and 70.");
        if(date.ToDateTime(time)<LocalNow)throw new ArgumentException("Choose a future reservation time.");
        var hours=await Hours(restaurantId,date);
        if(time<hours.Open || time.ToTimeSpan().Add(TimeSpan.FromMinutes(rules.Value.SlotDurationMinutes))>hours.Close.ToTimeSpan() || time.Minute%30!=0)
            throw new ArgumentException("Choose an available service time during opening hours.");
    }
    private async Task<List<TableEntity>> AvailableTables(Guid restaurantId,DateOnly date,TimeOnly time,int guests,Guid? exclude=null)
    {
        var tables=await db.Tables.Where(t=>t.RestaurantId==restaurantId&&t.Capacity>=guests&&t.Status!=TableStatuses.OutOfService).OrderBy(t=>t.Capacity).ThenBy(t=>t.TableNumber).ToListAsync();
        var bookings=await db.Reservations.Where(r=>r.RestaurantId==restaurantId&&r.ReservationDate==date&&ActiveStatuses.Contains(r.Status)&&r.ReservationId!=exclude).ToListAsync();
        var start=time.ToTimeSpan();var end=start.Add(TimeSpan.FromMinutes(rules.Value.SlotDurationMinutes));
        var now=LocalNow;
        return tables.Where(t=>!(date==DateOnly.FromDateTime(now)&&date.ToDateTime(time)<=now.AddMinutes(90)&&t.Status is TableStatuses.Occupied or TableStatuses.WaitingForCleaning)
            && !bookings.Any(b=>b.TableId==t.TableId&&start<b.ReservationTime.ToTimeSpan().Add(TimeSpan.FromMinutes(rules.Value.SlotDurationMinutes))&&end>b.ReservationTime.ToTimeSpan())).ToList();
    }
    public async Task<List<AvailabilitySlotDto>> GetAvailabilityAsync(Guid restaurantId,DateOnly date,int guestCount)
    {
        if(guestCount<1||guestCount>70)throw new ArgumentException("Party size must be between 1 and 70.");
        var hours=await Hours(restaurantId,date);var result=new List<AvailabilitySlotDto>();
        for(var slot=hours.Open;slot.ToTimeSpan().Add(TimeSpan.FromMinutes(rules.Value.SlotDurationMinutes))<=hours.Close.ToTimeSpan();slot=slot.AddMinutes(30))
        {
            var count=date.ToDateTime(slot)<LocalNow?0:(await AvailableTables(restaurantId,date,slot,guestCount)).Count;
            result.Add(new(slot.ToString("hh:mm tt"),count>0,count>0?$"{count} tables available":"Unavailable"));
        }
        return result;
    }
    public async Task<(bool Success,ReservationDto? Reservation,string Message)> CreateReservationAsync(CreateReservationRequest request)
    {
        await ValidateSlot(request.RestaurantId,request.ReservationDate,request.ReservationTime,request.GuestCount);
        await using var transaction=await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({"reservations:"+request.RestaurantId}))");
        var table=(await AvailableTables(request.RestaurantId,request.ReservationDate,request.ReservationTime,request.GuestCount)).FirstOrDefault();
        if(table==null)return(false,null,"This slot has just filled. Please choose another time.");
        var reservation=new Reservation { BookingId="RES-"+Guid.NewGuid().ToString("N")[..8].ToUpperInvariant(),RestaurantId=request.RestaurantId,CustomerId=request.CustomerId,TableId=table.TableId,
            CustomerName=request.CustomerName.Trim(),CustomerPhone=request.CustomerPhone.Trim(),CustomerEmail=request.CustomerEmail.Trim().ToLowerInvariant(),ReservationDate=request.ReservationDate,
            ReservationTime=request.ReservationTime,GuestCount=request.GuestCount,Status=ReservationStatuses.Confirmed,GracePeriodMinutes=rules.Value.ReservationGracePeriodMinutes,SpecialRequest=request.SpecialRequest };
        var nowLocal=LocalNow;var bookingDateTime=request.ReservationDate.ToDateTime(request.ReservationTime);
        if(request.ReservationDate==DateOnly.FromDateTime(nowLocal)&&nowLocal>=bookingDateTime.AddMinutes(-10)&&nowLocal<=bookingDateTime.AddMinutes(rules.Value.ReservationGracePeriodMinutes)&&table.Status==TableStatuses.Available){
            table.Status=TableStatuses.Reserved;table.CurrentCustomerName=request.CustomerName.Trim();table.UpdatedAt=DateTime.UtcNow;
        }
        db.Reservations.Add(reservation);await db.SaveChangesAsync();await transaction.CommitAsync();
        await notifications.NotifyRoleAsync(request.RestaurantId,UserRoles.Receptionist,"NEW_TABLE_RESERVATION","New reservation",$"{reservation.CustomerName}, {reservation.GuestCount} guests, table {table.TableNumber}",new {reservation.ReservationId});
        return(true,Map(reservation,table.TableNumber),"Your table is reserved.");
    }
    public async Task<List<ReservationDto>> GetReservationsAsync(Guid restaurantId,DateOnly? date,string? status)
    {
        var query=db.Reservations.Include(r=>r.Table).Where(r=>r.RestaurantId==restaurantId);
        if(date.HasValue)query=query.Where(r=>r.ReservationDate==date.Value);
        if(!string.IsNullOrEmpty(status))query=query.Where(r=>r.Status==status);
        return(await query.OrderByDescending(r=>r.CreatedAt).ToListAsync()).Select(r=>Map(r,r.Table?.TableNumber)).ToList();
    }
    public async Task<bool> UpdateReservationStatusAsync(Guid reservationId,string newStatus,Guid? assignedTableId)
    {
        var reservation=await db.Reservations.FindAsync(reservationId);if(reservation==null)return false;
        var valid=newStatus switch {
            ReservationStatuses.Arrived=>reservation.Status is ReservationStatuses.Confirmed or ReservationStatuses.Rescheduled,
            ReservationStatuses.Seated=>reservation.Status==ReservationStatuses.Arrived,
            ReservationStatuses.Completed=>reservation.Status==ReservationStatuses.Seated,
            ReservationStatuses.Cancelled=>reservation.Status is ReservationStatuses.Confirmed or ReservationStatuses.Arrived or ReservationStatuses.Rescheduled,
            ReservationStatuses.NoShow=>reservation.Status is ReservationStatuses.Confirmed or ReservationStatuses.Rescheduled,
            _=>false };
        if(!valid)throw new InvalidOperationException($"Cannot change reservation from {reservation.Status} to {newStatus}.");
        await using var transaction=await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({"reservations:"+reservation.RestaurantId}))");
        if(assignedTableId.HasValue&&assignedTableId!=reservation.TableId) {
            var available=await AvailableTables(reservation.RestaurantId,reservation.ReservationDate,reservation.ReservationTime,reservation.GuestCount,reservationId);
            if(!available.Any(t=>t.TableId==assignedTableId))throw new InvalidOperationException("The chosen table is unavailable for this booking.");
            reservation.TableId=assignedTableId;
        }
        reservation.Status=newStatus;reservation.UpdatedAt=DateTime.UtcNow;
        if(reservation.TableId.HasValue){
            var table=await db.Tables.FindAsync(reservation.TableId);
            if(table!=null&&newStatus==ReservationStatuses.Arrived&&table.Status==TableStatuses.Available){table.Status=TableStatuses.Reserved;table.CurrentCustomerName=reservation.CustomerName;table.UpdatedAt=DateTime.UtcNow;}
            if(table!=null&&newStatus==ReservationStatuses.Seated){table.Status=TableStatuses.Occupied;table.CurrentCustomerName=reservation.CustomerName;table.UpdatedAt=DateTime.UtcNow;}
            if(table!=null&&newStatus==ReservationStatuses.Completed){table.Status=TableStatuses.WaitingForCleaning;table.CurrentCustomerName=null;table.UpdatedAt=DateTime.UtcNow;}
            if(table!=null&&(newStatus==ReservationStatuses.Cancelled||newStatus==ReservationStatuses.NoShow)&&table.Status==TableStatuses.Reserved&&table.CurrentCustomerName==reservation.CustomerName){table.Status=TableStatuses.Available;table.CurrentCustomerName=null;table.UpdatedAt=DateTime.UtcNow;}
        }
        await db.SaveChangesAsync();await transaction.CommitAsync();
        await audit.LogAsync(reservation.RestaurantId,null,UserRoles.Receptionist,"RESERVATION_"+newStatus,"reservations",new{reservation.BookingId});return true;
    }
    public async Task<ReservationDto?> RescheduleReservationAsync(Guid reservationId,RescheduleReservationRequest request)
    {
        var reservation=await db.Reservations.Include(r => r.Table).FirstOrDefaultAsync(r => r.ReservationId == reservationId);if(reservation==null)return null;
        if(reservation.Status is not (ReservationStatuses.Confirmed or ReservationStatuses.Rescheduled))throw new InvalidOperationException("Only an upcoming booking can be rescheduled.");
        var guests=request.GuestCount??reservation.GuestCount;await ValidateSlot(reservation.RestaurantId,request.NewDate,request.NewTime,guests);
        await using var transaction=await db.Database.BeginTransactionAsync();
        await db.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtext({"reservations:"+reservation.RestaurantId}))");
        var table=(await AvailableTables(reservation.RestaurantId,request.NewDate,request.NewTime,guests,reservationId)).FirstOrDefault();
        if(table==null)throw new InvalidOperationException("No table is available at that time.");
        reservation.ReservationDate=request.NewDate;reservation.ReservationTime=request.NewTime;reservation.GuestCount=guests;reservation.TableId=table.TableId;reservation.Status=ReservationStatuses.Rescheduled;reservation.UpdatedAt=DateTime.UtcNow;
        await db.SaveChangesAsync();await transaction.CommitAsync();
        return Map(reservation, table.TableNumber);
    }
    public async Task<ReservationDto?> LookupReservationAsync(string query)
    {
        var raw = query.Trim();
        var upper = raw.ToUpperInvariant();
        var digits = new string(raw.Where(char.IsDigit).ToArray());
        var last10 = digits.Length >= 10 ? digits[^10..] : digits;

        // 1. Direct or partial booking ID lookup
        var reservation = await db.Reservations
            .Include(r => r.Table)
            .Where(r => r.BookingId.ToUpper() == upper
                     || r.BookingId.ToUpper() == "RES-" + upper
                     || r.BookingId.ToUpper().EndsWith(upper))
            .OrderByDescending(r => r.CreatedAt)
            .FirstOrDefaultAsync();

        if (reservation != null) return Map(reservation, reservation.Table?.TableNumber);

        // 2. Phone number lookup (supports raw, last 10 digits, formatted phones like +91 95168 51825)
        if (!string.IsNullOrEmpty(digits))
        {
            // Direct DB match (raw or last10 substring)
            reservation = await db.Reservations
                .Include(r => r.Table)
                .Where(r => r.CustomerPhone == raw || (last10.Length >= 6 && r.CustomerPhone.Contains(last10)))
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (reservation != null) return Map(reservation, reservation.Table?.TableNumber);

            // In-memory digit comparison for numbers formatted with spaces or country codes in DB
            var recent = await db.Reservations
                .Include(r => r.Table)
                .OrderByDescending(r => r.CreatedAt)
                .Take(150)
                .ToListAsync();

            reservation = recent.FirstOrDefault(r => {
                if (string.IsNullOrWhiteSpace(r.CustomerPhone)) return false;
                var phoneDigits = new string(r.CustomerPhone.Where(char.IsDigit).ToArray());
                return phoneDigits == digits 
                    || (last10.Length >= 6 && phoneDigits.EndsWith(last10))
                    || (phoneDigits.Length >= 10 && last10.EndsWith(phoneDigits[^10..]));
            });

            if (reservation != null) return Map(reservation, reservation.Table?.TableNumber);
        }

        // 3. Fallback name lookup if query is not numeric
        if (digits.Length < 4 && raw.Length >= 3)
        {
            reservation = await db.Reservations
                .Include(r => r.Table)
                .Where(r => r.CustomerName.ToLower().Contains(raw.ToLower()))
                .OrderByDescending(r => r.CreatedAt)
                .FirstOrDefaultAsync();

            if (reservation != null) return Map(reservation, reservation.Table?.TableNumber);
        }

        return null;
    }
    private static ReservationDto Map(Reservation r,int? table)=>new(r.ReservationId,r.BookingId,r.RestaurantId,r.TableId,table,r.CustomerName,r.CustomerPhone,r.CustomerEmail,r.ReservationDate,r.ReservationTime,r.GuestCount,r.Status,r.GracePeriodMinutes,r.SpecialRequest,r.CreatedAt);
}
