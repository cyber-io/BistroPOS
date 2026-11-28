namespace RestaurantSystem.Api.Configuration;

public class SupabaseOptions
{
    public const string SectionName = "Supabase";
    public string Url { get; set; } = string.Empty;
    public string AnonKey { get; set; } = string.Empty;
    public string ServiceRoleKey { get; set; } = string.Empty;
}

public class JwtOptions
{
    public const string SectionName = "Jwt";
    public string SecretKey { get; set; } = string.Empty;
    public string Issuer { get; set; } = string.Empty;
    public string Audience { get; set; } = string.Empty;
    public int ExpiryMinutes { get; set; } = 240;
}

public class SecurityOptions
{
    public const string SectionName = "Security";
    public string ResourceTokenKey { get; set; } = string.Empty;
    public int ResourceTokenHours { get; set; } = 24;
    public string[] CorsAllowedOrigins { get; set; } = [];
}

public class BusinessRulesOptions
{
    public const string SectionName = "BusinessRules";
    public int OrderCancellationLimitSeconds { get; set; } = 60;
    public int OrderConfirmationTimeoutMinutes { get; set; } = 5;
    public int ReservationGracePeriodMinutes { get; set; } = 10;
    public int SlotDurationMinutes { get; set; } = 90;
    public decimal TaxRate { get; set; } = 0.05m;
    public decimal StandardDeliveryFee { get; set; } = 40.00m;
}

public class PaymentGatewayOptions
{
    public const string SectionName = "PaymentGateway";
    public string Provider { get; set; } = "Razorpay";
    public string ApiKey { get; set; } = string.Empty;
    public string SecretKey { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
}

public class TextBeeOptions
{
    public const string SectionName = "TextBee";
    public bool Enabled { get; set; } = false;
    public string BaseUrl { get; set; } = "https://api.textbee.dev/api/v1";
    public string ApiKey { get; set; } = string.Empty;
    public string DeviceId { get; set; } = string.Empty;
    public string WebhookSecret { get; set; } = string.Empty;
    public string DefaultCountryCode { get; set; } = "+91";
    public int? SimSlotIndex { get; set; }
    public int MaxPerMinutePerRestaurant { get; set; } = 30;
}
