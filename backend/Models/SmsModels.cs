using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace RestaurantSystem.Api.Models;

[Table("sms_logs", Schema = "restaurant_pos")]
public class SmsLog
{
    [Key]
    public Guid SmsLogId { get; set; } = Guid.NewGuid();
    public Guid? RestaurantId { get; set; }
    [Required, MaxLength(64)]
    public string EventType { get; set; } = "SMS";
    [Required, MaxLength(32)]
    public string RecipientPhone { get; set; } = string.Empty;
    [Required]
    public string MessageBody { get; set; } = string.Empty;
    [MaxLength(128)]
    public string? ProviderMessageId { get; set; }
    [Required, MaxLength(32)]
    public string Status { get; set; } = "QUEUED";
    public int Attempts { get; set; } = 0;
    [MaxLength(128)]
    public string? DedupKey { get; set; }
    public string? ErrorMessage { get; set; }
    [MaxLength(128)]
    public string? ReferenceId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? SentAt { get; set; }
    public DateTime? DeliveredAt { get; set; }
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("sms_preferences", Schema = "restaurant_pos")]
public class SmsPreference
{
    [Key]
    public Guid PreferenceId { get; set; } = Guid.NewGuid();
    public Guid RestaurantId { get; set; }
    public bool OrderConfirmationEnabled { get; set; } = true;
    public bool OrderStatusEnabled { get; set; } = true;
    public bool DigitalReceiptEnabled { get; set; } = true;
    public bool ReservationEnabled { get; set; } = true;
    public bool PaymentConfirmationEnabled { get; set; } = true;
    public bool StaffShiftEnabled { get; set; } = true;
    public bool InventoryAlertEnabled { get; set; } = true;
    public bool LoyaltyEnabled { get; set; } = true;
    public bool PromotionalEnabled { get; set; } = false;
    [MaxLength(32)]
    public string? ManagerAlertPhone { get; set; }
    public string TemplatesJson { get; set; } = "{}";
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}

[Table("sms_consents", Schema = "restaurant_pos")]
public class SmsConsent
{
    [Key]
    public Guid ConsentId { get; set; } = Guid.NewGuid();
    public Guid RestaurantId { get; set; }
    [Required, MaxLength(32)]
    public string CustomerPhone { get; set; } = string.Empty;
    public bool PromotionalOptIn { get; set; } = false;
    public bool OptedOut { get; set; } = false;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;
}
