using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class LoyaltyService : ILoyaltyService
{
    private readonly RestaurantDbContext _db;
    private readonly IAuditLogService _audit;

    public LoyaltyService(RestaurantDbContext db, IAuditLogService audit)
    {
        _db = db;
        _audit = audit;
    }

    public async Task<CustomerLoyaltyDto?> GetLoyaltyByPhoneAsync(Guid restaurantId, string phone)
    {
        var cleanPhone = phone.Trim();
        var record = await _db.CustomerLoyalties
            .FirstOrDefaultAsync(l => l.RestaurantId == restaurantId && l.CustomerPhone == cleanPhone);

        if (record == null) return null;

        return new CustomerLoyaltyDto(
            record.LoyaltyId,
            record.RestaurantId,
            record.CustomerPhone,
            record.CustomerName,
            record.CustomerEmail,
            record.PointsBalance,
            record.LifetimePoints,
            record.Tier
        );
    }

    public async Task<CustomerLoyaltyDto> EarnPointsAsync(EarnLoyaltyPointsDto request)
    {
        var cleanPhone = request.CustomerPhone.Trim();
        var record = await _db.CustomerLoyalties
            .FirstOrDefaultAsync(l => l.RestaurantId == request.RestaurantId && l.CustomerPhone == cleanPhone);

        // 1 point per 10 currency spent
        var pointsEarned = (int)Math.Floor(request.OrderAmount / 10m);
        if (pointsEarned <= 0) pointsEarned = 1;

        if (record == null)
        {
            record = new CustomerLoyalty
            {
                RestaurantId = request.RestaurantId,
                CustomerPhone = cleanPhone,
                CustomerName = request.CustomerName,
                PointsBalance = pointsEarned,
                LifetimePoints = pointsEarned,
                Tier = DetermineTier(pointsEarned)
            };
            _db.CustomerLoyalties.Add(record);
        }
        else
        {
            record.PointsBalance += pointsEarned;
            record.LifetimePoints += pointsEarned;
            if (!string.IsNullOrEmpty(request.CustomerName)) record.CustomerName = request.CustomerName;
            record.Tier = DetermineTier(record.LifetimePoints);
            record.UpdatedAt = DateTime.UtcNow;
        }

        await _db.SaveChangesAsync();
        await _audit.LogAsync(request.RestaurantId, null, "CUSTOMER", "LOYALTY_EARN", "customer_loyalty", new { PointsEarned = pointsEarned, Total = record.PointsBalance });

        return new CustomerLoyaltyDto(
            record.LoyaltyId,
            record.RestaurantId,
            record.CustomerPhone,
            record.CustomerName,
            record.CustomerEmail,
            record.PointsBalance,
            record.LifetimePoints,
            record.Tier
        );
    }

    public async Task<(bool Success, CustomerLoyaltyDto? Loyalty, decimal DiscountAmount, string Message)> RedeemPointsAsync(RedeemLoyaltyPointsDto request)
    {
        var cleanPhone = request.CustomerPhone.Trim();
        var record = await _db.CustomerLoyalties
            .FirstOrDefaultAsync(l => l.RestaurantId == request.RestaurantId && l.CustomerPhone == cleanPhone);

        if (record == null || record.PointsBalance < request.PointsToRedeem)
        {
            return (false, null, 0, "Insufficient loyalty points balance.");
        }

        // 100 points = 50 INR discount (0.5 INR per point)
        var discountAmount = request.PointsToRedeem * 0.5m;
        record.PointsBalance -= request.PointsToRedeem;
        record.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync();
        await _audit.LogAsync(request.RestaurantId, null, "CUSTOMER", "LOYALTY_REDEEM", "customer_loyalty", new { Redeemed = request.PointsToRedeem, Discount = discountAmount });

        var dto = new CustomerLoyaltyDto(
            record.LoyaltyId,
            record.RestaurantId,
            record.CustomerPhone,
            record.CustomerName,
            record.CustomerEmail,
            record.PointsBalance,
            record.LifetimePoints,
            record.Tier
        );

        return (true, dto, discountAmount, $"Successfully redeemed {request.PointsToRedeem} points for a discount of ₹{discountAmount:F2}.");
    }

    private static string DetermineTier(int lifetimePoints)
    {
        if (lifetimePoints >= 3000) return "PLATINUM";
        if (lifetimePoints >= 1500) return "GOLD";
        if (lifetimePoints >= 500) return "SILVER";
        return "BRONZE";
    }
}

public class FeedbackService : IFeedbackService
{
    private readonly RestaurantDbContext _db;
    private readonly IAuditLogService _audit;
    private readonly INotificationService _notifications;

    public FeedbackService(RestaurantDbContext db, IAuditLogService audit, INotificationService notifications)
    {
        _db = db;
        _audit = audit;
        _notifications = notifications;
    }

    public async Task<CustomerFeedbackDto> CreateFeedbackAsync(CreateFeedbackDto request)
    {
        var feedback = new CustomerFeedback
        {
            RestaurantId = request.RestaurantId,
            OrderId = request.OrderId,
            CustomerName = request.CustomerName,
            CustomerPhone = request.CustomerPhone,
            Rating = Math.Clamp(request.Rating, 1, 5),
            FoodRating = Math.Clamp(request.FoodRating ?? request.Rating, 1, 5),
            ServiceRating = Math.Clamp(request.ServiceRating ?? request.Rating, 1, 5),
            AmbianceRating = Math.Clamp(request.AmbianceRating ?? request.Rating, 1, 5),
            Comment = request.Comment,
            GoogleReviewClicked = request.GoogleReviewClicked ?? false,
            CreatedAt = DateTime.UtcNow
        };

        _db.CustomerFeedbacks.Add(feedback);
        await _db.SaveChangesAsync();

        if (feedback.Rating <= 2)
        {
            await _notifications.NotifyRoleAsync(
                request.RestaurantId,
                UserRoles.Receptionist,
                "CUSTOMER_FEEDBACK_LOW",
                "Low Rating Customer Feedback Received",
                $"{feedback.CustomerName ?? "A guest"} left a {feedback.Rating}-star review: \"{feedback.Comment}\"",
                new { feedback.FeedbackId, feedback.Rating }
            );
        }

        await _audit.LogAsync(request.RestaurantId, null, "CUSTOMER", "FEEDBACK_SUBMIT", "customer_feedbacks", new { feedback.Rating, feedback.Comment });

        return new CustomerFeedbackDto(
            feedback.FeedbackId,
            feedback.RestaurantId,
            feedback.OrderId,
            feedback.CustomerName,
            feedback.CustomerPhone,
            feedback.Rating,
            feedback.FoodRating,
            feedback.ServiceRating,
            feedback.AmbianceRating,
            feedback.Comment,
            feedback.GoogleReviewClicked,
            feedback.CreatedAt
        );
    }

    public async Task<List<CustomerFeedbackDto>> GetFeedbacksAsync(Guid restaurantId)
    {
        var list = await _db.CustomerFeedbacks
            .Where(f => f.RestaurantId == restaurantId)
            .OrderByDescending(f => f.CreatedAt)
            .Take(100)
            .ToListAsync();

        return list.Select(f => new CustomerFeedbackDto(
            f.FeedbackId,
            f.RestaurantId,
            f.OrderId,
            f.CustomerName,
            f.CustomerPhone,
            f.Rating,
            f.FoodRating,
            f.ServiceRating,
            f.AmbianceRating,
            f.Comment,
            f.GoogleReviewClicked,
            f.CreatedAt
        )).ToList();
    }
}
