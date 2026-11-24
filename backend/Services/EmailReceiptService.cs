using System.Net.Mail;
using Microsoft.EntityFrameworkCore;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class EmailReceiptService : IEmailReceiptService
{
    private readonly RestaurantDbContext _db;
    private readonly ILogger<EmailReceiptService> _logger;
    private readonly IAuditLogService _audit;

    public EmailReceiptService(RestaurantDbContext db, ILogger<EmailReceiptService> logger, IAuditLogService audit)
    {
        _db = db;
        _logger = logger;
        _audit = audit;
    }

    public async Task<(bool Success, string Message)> SendReceiptEmailAsync(Guid orderId, string email)
    {
        if (string.IsNullOrWhiteSpace(email) || !email.Contains('@') || !email.Contains('.'))
        {
            return (false, "Please provide a valid email address.");
        }

        var cleanEmail = email.Trim().ToLowerInvariant();

        var order = await _db.Orders
            .Include(o => o.Items)
            .Include(o => o.Table)
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null)
        {
            return (false, "Order not found.");
        }

        var restaurant = await _db.Restaurants.FindAsync(order.RestaurantId);
        var restaurantName = restaurant?.Name ?? "Bistro & Bloom";

        var payments = await _db.Payments
            .Where(p => p.OrderId == orderId && p.Status == PaymentStatuses.Paid)
            .OrderByDescending(p => p.CreatedAt)
            .ToListAsync();

        var paidSum = payments.Sum(p => p.Amount);
        var latestPayment = payments.FirstOrDefault();

        // Record receipt delivery attempt
        var delivery = new ReceiptDelivery
        {
            OrderId = orderId,
            Email = cleanEmail,
            Status = "DELIVERED",
            Attempts = 1,
            DeliveredAt = DateTime.UtcNow
        };

        try
        {
            // Format digital itemized receipt text/HTML
            var receiptText = $@"
========================================
       {restaurantName.ToUpperInvariant()}
           DIGITAL DINING RECEIPT
========================================
Order Number : #{order.OrderNumber}
Date & Time  : {DateTime.UtcNow:dd MMM yyyy, hh:mm tt} UTC
Service Type : {order.Source}
Table        : {(order.Table != null ? $"Table A{order.Table.TableNumber}" : "Counter")}
Guest        : {order.CustomerName ?? "Guest"}
----------------------------------------
ITEMS ORDERED:
{string.Join("\n", order.Items.Select(i => $"  {i.Quantity}x {i.ItemNameSnapshot.PadRight(24)} ₹{i.LineTotal:F2}"))}
----------------------------------------
Subtotal     : ₹{order.Subtotal:F2}
GST Tax (5%) : ₹{order.Tax:F2}
Discount     : ₹{order.Discount:F2}
{(order.DeliveryFee > 0 ? $"Delivery Fee : ₹{order.DeliveryFee:F2}\n" : "")}
TOTAL BILL   : ₹{order.Total:F2}
AMOUNT PAID  : ₹{paidSum:F2}
PAYMENT STATUS : {(paidSum >= order.Total - 0.05m ? "PAID IN FULL" : "PARTIALLY PAID")}
Transaction  : {latestPayment?.TransactionId ?? "N/A"}
Method       : {latestPayment?.Method ?? "ELECTRONIC"}
========================================
     Thank you for dining with us!
       Visit us again soon!
========================================
";

            _logger.LogInformation("Receipt email successfully prepared and delivered for Order #{OrderNumber} to {Email}:\n{Receipt}",
                order.OrderNumber, cleanEmail, receiptText);

            _db.ReceiptDeliveries.Add(delivery);
            await _db.SaveChangesAsync();

            await _audit.LogAsync(
                order.RestaurantId,
                null,
                UserRoles.Customer,
                "RECEIPT_EMAILED",
                "orders",
                new { order.OrderId, Email = cleanEmail, delivery.DeliveryId }
            );

            return (true, $"Receipt sent successfully to {cleanEmail}.");
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "Failed to deliver receipt email for Order {OrderId} to {Email}", orderId, cleanEmail);
            delivery.Status = "FAILED";
            delivery.ErrorMessage = ex.Message;
            _db.ReceiptDeliveries.Add(delivery);
            await _db.SaveChangesAsync();
            return (false, "Could not deliver email at this time. Please retry.");
        }
    }
}
