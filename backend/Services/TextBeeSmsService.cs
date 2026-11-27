using System.Collections.Concurrent;
using System.Net.Http.Json;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;
using RestaurantSystem.Api.DTOs;
using RestaurantSystem.Api.Models;
using RestaurantSystem.Api.Repositories;

namespace RestaurantSystem.Api.Services;

public class TextBeeSmsService(
    RestaurantDbContext db,
    IHttpClientFactory clients,
    IOptions<TextBeeOptions> options,
    IAuditLogService audit,
    SmsQueue smsQueue,
    ILogger<TextBeeSmsService> logger) : ITextBeeSmsService
{
    private static readonly ConcurrentDictionary<Guid, Queue<DateTime>> RateWindows = new();

    private static readonly Dictionary<string, string> DefaultTemplates = new()
    {
        ["ORDER_CONFIRMED"] = "{restaurant}: Order #{orderNumber} confirmed! Total: INR {total}. We'll notify you when it's ready.",
        ["ORDER_READY"] = "{restaurant}: Good news! Your order #{orderNumber} is now READY.",
        ["ORDER_READY_FOR_PICKUP"] = "{restaurant}: Order #{orderNumber} is READY for pickup at the counter.",
        ["ORDER_OUT_FOR_DELIVERY"] = "{restaurant}: Your order #{orderNumber} is OUT FOR DELIVERY.",
        ["ORDER_CANCELLED"] = "{restaurant}: Order #{orderNumber} was cancelled. Reason: {reason}.",
        ["PAYMENT_CONFIRMED"] = "{restaurant}: Payment of INR {amount} confirmed for Order #{orderNumber} ({method}). Thank you!",
        ["RESERVATION_CONFIRMED"] = "{restaurant}: Reservation {bookingId} confirmed for {guestCount} guests on {date} at {time}. Table A{tableNumber}.",
        ["WAITLIST_TABLE_READY"] = "{restaurant}: Hi {customerName}, your table for {partySize} is ready! Please check in at the host desk.",
        ["INVENTORY_LOW_STOCK"] = "{restaurant} Alert: {itemName} is {status} ({currentStock} {unit} remaining).",
        ["LOYALTY_EARN"] = "{restaurant}: You earned {points} loyalty points! Balance: {balance} pts ({tier} tier).",
        ["LOYALTY_REDEEM"] = "{restaurant}: Redeemed {points} pts for INR {discount} off. Remaining balance: {balance} pts.",
        ["STAFF_SHIFT"] = "{restaurant}: Shift update for {staffName} — {message}.",
        ["SOFTWARE_PURCHASE_WELCOME"] = "Welcome to BistroPOS! Thank you for purchasing BistroPOS for {restaurant}. Your restaurant portal is now active.",
    };

    private sealed record ResolvedTextBeeConfig(
        bool Enabled,
        string BaseUrl,
        string ApiKey,
        string DeviceId,
        string WebhookSecret,
        string DefaultCountryCode,
        int? SimSlotIndex);

    private static string ExtractTextBeeError(string body)
    {
        if (string.IsNullOrWhiteSpace(body)) return "";
        try
        {
            using var doc = JsonDocument.Parse(body);
            var root = doc.RootElement;
            if (root.TryGetProperty("error", out var err) && err.ValueKind == JsonValueKind.String)
                return err.GetString() ?? "";
            if (root.TryGetProperty("message", out var msg))
            {
                if (msg.ValueKind == JsonValueKind.String) return msg.GetString() ?? "";
                if (msg.ValueKind == JsonValueKind.Array)
                    return string.Join("; ", msg.EnumerateArray().Select(e => e.ToString()));
            }
        }
        catch { }
        return body.Length > 200 ? body[..200] : body;
    }

    private static string MaskKey(string key) =>
        string.IsNullOrWhiteSpace(key) ? "" : key.Length <= 4 ? "****" : $"****{key[^4..]}";

    private ResolvedTextBeeConfig ResolveConfig(Restaurant? restaurant)
    {
        var global = options.Value;
        var envEnabled = Environment.GetEnvironmentVariable("TEXTBEE_ENABLED");
        bool enabled = global.Enabled || string.Equals(envEnabled, "true", StringComparison.OrdinalIgnoreCase);
        string baseUrl = !string.IsNullOrWhiteSpace(global.BaseUrl)
            ? global.BaseUrl
            : Environment.GetEnvironmentVariable("TEXTBEE_BASE_URL") ?? "https://api.textbee.dev/api/v1";
        string apiKey = !string.IsNullOrWhiteSpace(global.ApiKey)
            ? global.ApiKey
            : Environment.GetEnvironmentVariable("TEXTBEE_API_KEY") ?? string.Empty;
        string deviceId = !string.IsNullOrWhiteSpace(global.DeviceId)
            ? global.DeviceId
            : Environment.GetEnvironmentVariable("TEXTBEE_DEVICE_ID") ?? string.Empty;
        string webhookSecret = !string.IsNullOrWhiteSpace(global.WebhookSecret)
            ? global.WebhookSecret
            : Environment.GetEnvironmentVariable("TEXTBEE_WEBHOOK_SECRET") ?? string.Empty;
        string countryCode = string.IsNullOrWhiteSpace(global.DefaultCountryCode) ? "+91" : global.DefaultCountryCode.Trim();
        int? simSlot = global.SimSlotIndex;

        if (!string.IsNullOrWhiteSpace(restaurant?.Settings))
        {
            try
            {
                using var doc = JsonDocument.Parse(restaurant.Settings);
                var root = doc.RootElement;
                if (root.TryGetProperty("textbeeEnabled", out var en) && en.ValueKind is JsonValueKind.True or JsonValueKind.False)
                    enabled = en.GetBoolean();
                if (root.TryGetProperty("textbeeBaseUrl", out var url) && url.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(url.GetString()))
                    baseUrl = url.GetString()!.Trim();
                if (root.TryGetProperty("textbeeApiKey", out var key) && key.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(key.GetString()))
                    apiKey = key.GetString()!.Trim();
                if (root.TryGetProperty("textbeeDeviceId", out var dev) && dev.ValueKind == JsonValueKind.String)
                    deviceId = dev.GetString()!.Trim();
                if (root.TryGetProperty("textbeeCountryCode", out var cc) && cc.ValueKind == JsonValueKind.String && !string.IsNullOrWhiteSpace(cc.GetString()))
                    countryCode = cc.GetString()!.Trim();
                if (root.TryGetProperty("textbeeSimSlotIndex", out var sim) && sim.ValueKind == JsonValueKind.Number && sim.TryGetInt32(out var slotIdx))
                    simSlot = slotIdx;
            }
            catch (JsonException) { }
        }

        return new ResolvedTextBeeConfig(enabled, baseUrl, apiKey, deviceId, webhookSecret, countryCode, simSlot);
    }

    public static string? NormalizePhone(string? rawPhone, string defaultCountryCode = "+91")
    {
        if (string.IsNullOrWhiteSpace(rawPhone)) return null;
        var trimmed = rawPhone.Trim();
        var hasPlus = trimmed.StartsWith('+');
        var digits = new string(trimmed.Where(char.IsDigit).ToArray());
        if (digits.Length < 8) return null;

        if (hasPlus) return $"+{digits}";
        if (digits.Length == 10)
        {
            var cc = defaultCountryCode.StartsWith('+') ? defaultCountryCode : $"+{defaultCountryCode}";
            return $"{cc}{digits}";
        }
        return $"+{digits}";
    }

    private static string ComputeDedupKey(Guid? restaurantId, string eventType, string phone, string? referenceId, string body)
    {
        var raw = $"{restaurantId}|{eventType}|{phone}|{referenceId ?? body}";
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes(raw));
        return Convert.ToHexString(hash)[..32];
    }

    private bool AllowRate(Guid restaurantId)
    {
        var limit = Math.Max(1, options.Value.MaxPerMinutePerRestaurant);
        var queue = RateWindows.GetOrAdd(restaurantId, _ => new Queue<DateTime>());
        var cutoff = DateTime.UtcNow.AddMinutes(-1);
        lock (queue)
        {
            while (queue.Count > 0 && queue.Peek() < cutoff) queue.Dequeue();
            if (queue.Count >= limit) return false;
            queue.Enqueue(DateTime.UtcNow);
            return true;
        }
    }

    private async Task<bool> IsDuplicateAsync(string dedupKey)
    {
        try
        {
            var cutoff = DateTime.UtcNow.AddMinutes(-2);
            return await db.SmsLogs.AnyAsync(l => l.DedupKey == dedupKey && l.CreatedAt >= cutoff && l.Status != "FAILED");
        }
        catch { return false; }
    }

    private async Task<bool> IsConsentAllowedAsync(Guid? restaurantId, string normalizedPhone, bool isPromotional)
    {
        if (!restaurantId.HasValue) return !isPromotional;
        try
        {
            var consent = await db.SmsConsents
                .FirstOrDefaultAsync(c => c.RestaurantId == restaurantId.Value && c.CustomerPhone == normalizedPhone);
            if (consent?.OptedOut == true) return false;
            if (isPromotional) return consent?.PromotionalOptIn == true;
            return true;
        }
        catch { return !isPromotional; }
    }

    private async Task<SmsPreference> GetOrBuildPreferenceAsync(Guid restaurantId)
    {
        try
        {
            var pref = await db.SmsPreferences.FirstOrDefaultAsync(p => p.RestaurantId == restaurantId);
            if (pref != null) return pref;
        }
        catch { }
        return new SmsPreference { RestaurantId = restaurantId };
    }

    private static bool IsEventEnabled(SmsPreference pref, string eventType) => eventType switch
    {
        "ORDER_CONFIRMED" => pref.OrderConfirmationEnabled,
        "ORDER_READY" or "ORDER_READY_FOR_PICKUP" or "ORDER_OUT_FOR_DELIVERY" or "ORDER_CANCELLED" => pref.OrderStatusEnabled,
        "ORDER_RECEIPT_SMS" => pref.DigitalReceiptEnabled,
        "RESERVATION_CONFIRMED" => pref.ReservationEnabled,
        "WAITLIST_TABLE_READY" => pref.ReservationEnabled,
        "PAYMENT_CONFIRMED" => pref.PaymentConfirmationEnabled,
        "STAFF_SHIFT" => pref.StaffShiftEnabled,
        "INVENTORY_LOW_STOCK" => pref.InventoryAlertEnabled,
        "LOYALTY_EARN" or "LOYALTY_REDEEM" => pref.LoyaltyEnabled,
        "PROMOTIONAL" => pref.PromotionalEnabled,
        _ => true
    };

    private static string RenderTemplate(SmsPreference pref, string eventType, Dictionary<string, string> variables)
    {
        var template = DefaultTemplates.GetValueOrDefault(eventType, "{message}");
        try
        {
            if (!string.IsNullOrWhiteSpace(pref.TemplatesJson))
            {
                var custom = JsonSerializer.Deserialize<Dictionary<string, string>>(pref.TemplatesJson);
                if (custom != null && custom.TryGetValue(eventType, out var customTpl) && !string.IsNullOrWhiteSpace(customTpl))
                    template = customTpl;
            }
        }
        catch { }

        var rendered = template;
        foreach (var (k, v) in variables)
            rendered = rendered.Replace($"{{{k}}}", v ?? "", StringComparison.OrdinalIgnoreCase);
        return rendered;
    }

    public async Task<TextBeeConfigDto> GetConfigAsync(Guid restaurantId)
    {
        var restaurant = await db.Restaurants.FindAsync(restaurantId);
        var cfg = ResolveConfig(restaurant);
        return new TextBeeConfigDto(
            cfg.Enabled,
            cfg.BaseUrl,
            !string.IsNullOrWhiteSpace(cfg.ApiKey),
            MaskKey(cfg.ApiKey),
            cfg.DeviceId,
            cfg.DefaultCountryCode,
            cfg.SimSlotIndex);
    }

    public async Task<TextBeeConfigDto> UpdateConfigAsync(Guid restaurantId, UpdateTextBeeConfigDto dto)
    {
        var restaurant = await db.Restaurants.FindAsync(restaurantId)
            ?? throw new KeyNotFoundException("Restaurant not found.");

        JsonObject root;
        try
        {
            root = string.IsNullOrWhiteSpace(restaurant.Settings)
                ? new JsonObject()
                : JsonNode.Parse(restaurant.Settings)?.AsObject() ?? new JsonObject();
        }
        catch { root = new JsonObject(); }

        if (dto.Enabled.HasValue) root["textbeeEnabled"] = dto.Enabled.Value;
        if (dto.BaseUrl != null) root["textbeeBaseUrl"] = dto.BaseUrl.Trim().TrimEnd('/');
        if (!string.IsNullOrWhiteSpace(dto.ApiKey)) root["textbeeApiKey"] = dto.ApiKey.Trim();
        if (dto.DeviceId != null) root["textbeeDeviceId"] = dto.DeviceId.Trim();
        if (!string.IsNullOrWhiteSpace(dto.DefaultCountryCode)) root["textbeeCountryCode"] = dto.DefaultCountryCode.Trim();
        if (dto.SimSlotIndex.HasValue) root["textbeeSimSlotIndex"] = dto.SimSlotIndex.Value;

        restaurant.Settings = root.ToJsonString();
        restaurant.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();

        await audit.LogAsync(restaurantId, null, UserRoles.Manager, "TEXTBEE_CONFIG_UPDATED", "restaurants", new
        {
            Enabled = dto.Enabled,
            BaseUrl = dto.BaseUrl,
            HasDeviceId = !string.IsNullOrWhiteSpace(dto.DeviceId)
        });

        return await GetConfigAsync(restaurantId);
    }

    public async Task EnqueueEventSmsAsync(
        Guid? restaurantId,
        string eventType,
        string? phoneNumber,
        Dictionary<string, string> variables,
        string? referenceId = null,
        bool isPromotional = false)
    {
        try
        {
            var restaurant = restaurantId.HasValue ? await db.Restaurants.FindAsync(restaurantId.Value) : null;
            var cfg = ResolveConfig(restaurant);
            if (!cfg.Enabled || string.IsNullOrWhiteSpace(cfg.BaseUrl) || string.IsNullOrWhiteSpace(cfg.ApiKey))
                return;

            var pref = restaurantId.HasValue ? await GetOrBuildPreferenceAsync(restaurantId.Value) : new SmsPreference();
            if (restaurantId.HasValue && !IsEventEnabled(pref, eventType))
                return;

            var targetPhone = phoneNumber;
            if (string.IsNullOrWhiteSpace(targetPhone) && eventType is "INVENTORY_LOW_STOCK" or "STAFF_SHIFT")
                targetPhone = pref.ManagerAlertPhone;

            var normalized = NormalizePhone(targetPhone, cfg.DefaultCountryCode);
            if (normalized == null) return;

            if (!await IsConsentAllowedAsync(restaurantId, normalized, isPromotional))
                return;

            if (!variables.ContainsKey("restaurant"))
                variables["restaurant"] = restaurant?.Name ?? "BistroPOS";

            var body = RenderTemplate(pref, eventType, variables);
            var dedupKey = ComputeDedupKey(restaurantId, eventType, normalized, referenceId, body);
            if (await IsDuplicateAsync(dedupKey))
                return;

            var log = new SmsLog
            {
                RestaurantId = restaurantId,
                EventType = eventType,
                RecipientPhone = normalized,
                MessageBody = body,
                Status = "QUEUED",
                DedupKey = dedupKey,
                ReferenceId = referenceId,
                CreatedAt = DateTime.UtcNow,
                UpdatedAt = DateTime.UtcNow
            };
            db.SmsLogs.Add(log);
            await db.SaveChangesAsync();

            smsQueue.TryEnqueue(log.SmsLogId);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Failed to enqueue {EventType} SMS for restaurant {RestaurantId}", eventType, restaurantId);
        }
    }

    public async Task<(bool Done, bool Retryable)> DispatchQueuedSmsAsync(Guid smsLogId, int attempt, CancellationToken ct = default)
    {
        var log = await db.SmsLogs.FindAsync([smsLogId], ct);
        if (log == null || log.Status is "SENT" or "DELIVERED") return (true, false);

        var restaurant = log.RestaurantId.HasValue ? await db.Restaurants.FindAsync([log.RestaurantId.Value], ct) : null;
        var cfg = ResolveConfig(restaurant);
        if (!cfg.Enabled || string.IsNullOrWhiteSpace(cfg.BaseUrl) || string.IsNullOrWhiteSpace(cfg.ApiKey))
        {
            log.Status = "SKIPPED";
            log.ErrorMessage = "TextBee gateway disabled or unconfigured.";
            log.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (true, false);
        }

        if (log.RestaurantId.HasValue && !AllowRate(log.RestaurantId.Value))
        {
            log.Attempts = attempt;
            log.ErrorMessage = "Rate limit exceeded; retrying.";
            log.UpdatedAt = DateTime.UtcNow;
            await db.SaveChangesAsync(ct);
            return (false, true);
        }

        var (ok, providerId, err, retryable) = await SendViaHttpAsync(cfg, log.RecipientPhone, log.MessageBody, ct);
        log.Attempts = attempt;
        log.UpdatedAt = DateTime.UtcNow;

        if (ok)
        {
            log.Status = "SENT";
            log.ProviderMessageId = providerId;
            log.SentAt = DateTime.UtcNow;
            log.ErrorMessage = null;
            await db.SaveChangesAsync(ct);
            return (true, false);
        }

        log.Status = attempt >= 3 || !retryable ? "FAILED" : "QUEUED";
        log.ErrorMessage = err;
        await db.SaveChangesAsync(ct);
        return (false, retryable);
    }

    private async Task<(bool Ok, string? ProviderMessageId, string? Error, bool Retryable)> SendViaHttpAsync(
        ResolvedTextBeeConfig cfg, string normalizedPhone, string message, CancellationToken ct = default)
    {
        var baseUrl = cfg.BaseUrl.TrimEnd('/');
        var hasDevice = !string.IsNullOrWhiteSpace(cfg.DeviceId);
        var endpoint = hasDevice
            ? $"{baseUrl}/gateway/devices/{Uri.EscapeDataString(cfg.DeviceId.Trim())}/send-sms"
            : $"{baseUrl}/gateway/send-sms";
        var payload = new Dictionary<string, object?>
        {
            ["recipients"] = new[] { normalizedPhone },
            ["message"] = message.Trim()
        };
        if (hasDevice)
            payload["deviceId"] = cfg.DeviceId.Trim();
        if (cfg.SimSlotIndex.HasValue)
            payload["simSlotIndex"] = cfg.SimSlotIndex.Value;

        try
        {
            var client = clients.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(12);

            using var req = new HttpRequestMessage(HttpMethod.Post, endpoint) { Content = JsonContent.Create(payload) };
            req.Headers.Add("x-api-key", cfg.ApiKey);

            using var res = await client.SendAsync(req, ct);
            var responseBody = await res.Content.ReadAsStringAsync(ct);

            if (!res.IsSuccessStatusCode)
            {
                var retryable = (int)res.StatusCode >= 500 || (int)res.StatusCode == 429;
                var detail = ExtractTextBeeError(responseBody);
                return (false, null, string.IsNullOrWhiteSpace(detail)
                    ? $"TextBee HTTP {(int)res.StatusCode}"
                    : $"TextBee HTTP {(int)res.StatusCode}: {detail}", retryable);
            }

            string? batchId = null;
            try
            {
                using var doc = JsonDocument.Parse(responseBody);
                if (doc.RootElement.TryGetProperty("data", out var data))
                {
                    if (data.TryGetProperty("smsBatchId", out var bid)) batchId = bid.GetString();
                    else if (data.TryGetProperty("batch", out var batch) && batch.TryGetProperty("_id", out var idProp))
                        batchId = idProp.GetString();
                }
            }
            catch { }

            return (true, batchId, null, false);
        }
        catch (Exception ex)
        {
            return (false, null, ex.Message, true);
        }
    }

    public async Task<(bool Success, string Message)> SendSmsAsync(
        Guid? restaurantId,
        string phoneNumber,
        string message,
        string eventType = "SMS",
        string? referenceId = null,
        bool isPromotional = false)
    {
        if (string.IsNullOrWhiteSpace(message))
            return (false, "SMS message body cannot be empty.");

        var restaurant = restaurantId.HasValue ? await db.Restaurants.FindAsync(restaurantId.Value) : null;
        var cfg = ResolveConfig(restaurant);

        if (!cfg.Enabled)
            return (false, "TextBee SMS gateway is disabled.");

        if (string.IsNullOrWhiteSpace(cfg.BaseUrl) || string.IsNullOrWhiteSpace(cfg.ApiKey))
            return (false, "TextBee API key is not configured. Open Admin → SMS & Notifications (or Edit Restaurant) to paste your TextBee API Key, or set TextBee:ApiKey in appsettings.Development.local.json.");

        var normalized = NormalizePhone(phoneNumber, cfg.DefaultCountryCode);
        if (normalized == null)
            return (false, "Valid recipient phone number is required.");

        if (!await IsConsentAllowedAsync(restaurantId, normalized, isPromotional))
            return (false, "Recipient has not consented or has opted out of SMS.");

        if (restaurantId.HasValue && !AllowRate(restaurantId.Value))
            return (false, "SMS rate limit exceeded. Please try again in a minute.");

        var dedupKey = ComputeDedupKey(restaurantId, eventType, normalized, referenceId, message);
        if (eventType != "TEST_SMS" && await IsDuplicateAsync(dedupKey))
            return (true, $"Duplicate {eventType} skipped.");

        var log = new SmsLog
        {
            RestaurantId = restaurantId,
            EventType = eventType,
            RecipientPhone = normalized,
            MessageBody = message.Trim(),
            Status = "QUEUED",
            Attempts = 1,
            DedupKey = dedupKey,
            ReferenceId = referenceId,
            CreatedAt = DateTime.UtcNow,
            UpdatedAt = DateTime.UtcNow
        };

        var (ok, providerId, err, _) = await SendViaHttpAsync(cfg, normalized, message);
        log.Status = ok ? "SENT" : "FAILED";
        log.ProviderMessageId = providerId;
        log.SentAt = ok ? DateTime.UtcNow : null;
        log.ErrorMessage = err;
        log.UpdatedAt = DateTime.UtcNow;

        try
        {
            db.SmsLogs.Add(log);
            await db.SaveChangesAsync();
        }
        catch { }

        if (!ok)
        {
            logger.LogWarning("TextBee SMS failed for {EventType}: {Error}", eventType, err);
            return (false, $"TextBee error: {err}");
        }

        await audit.LogAsync(restaurantId, null, "SYSTEM", "SMS_SENT", "textbee", new
        {
            EventType = eventType,
            Recipient = normalized,
            log.SmsLogId
        });

        return (true, $"SMS sent to {normalized}.");
    }

    public async Task<(bool Success, string Message)> SendOrderReceiptSmsAsync(Guid orderId, string phoneNumber)
    {
        var order = await db.Orders
            .Include(o => o.Items)
            .Include(o => o.Table)
            .FirstOrDefaultAsync(o => o.OrderId == orderId);

        if (order == null)
            return (false, "Order not found.");

        var restaurant = await db.Restaurants.FindAsync(order.RestaurantId);
        var restaurantName = restaurant?.Name ?? "Bistro & Bloom";
        var paidSum = await db.Payments
            .Where(p => p.OrderId == orderId && p.Status == PaymentStatuses.Paid)
            .SumAsync(p => p.Amount);

        var itemSummary = string.Join(", ", order.Items.Take(4).Select(i => $"{i.Quantity}x {i.ItemNameSnapshot}"));
        if (order.Items.Count > 4)
            itemSummary += $" +{order.Items.Count - 4} more";

        var statusLabel = paidSum >= order.Total - 0.05m ? "PAID" : "DUE";
        var tableLabel = order.Table != null ? $"Table A{order.Table.TableNumber}" : order.Source;

        var sms = $"{restaurantName} Bill Receipt\nOrder #{order.OrderNumber} ({tableLabel})\nItems: {itemSummary}\nTotal: INR {order.Total:F2} [{statusLabel}]\nThank you for visiting! Please visit again.";
        return await SendSmsAsync(order.RestaurantId, phoneNumber, sms, "ORDER_RECEIPT_SMS", order.OrderId.ToString());
    }

    public async Task<List<SmsLogDto>> GetLogsAsync(Guid restaurantId, string? status = null, int limit = 50)
    {
        var q = db.SmsLogs.Where(l => l.RestaurantId == restaurantId);
        if (!string.IsNullOrWhiteSpace(status))
            q = q.Where(l => l.Status == status.Trim().ToUpperInvariant());

        var rows = await q.OrderByDescending(l => l.CreatedAt).Take(Math.Clamp(limit, 1, 200)).ToListAsync();
        return rows.Select(l => new SmsLogDto(
            l.SmsLogId, l.RestaurantId, l.EventType, l.RecipientPhone, l.MessageBody,
            l.ProviderMessageId, l.Status, l.Attempts, l.ErrorMessage, l.ReferenceId,
            l.CreatedAt, l.SentAt, l.DeliveredAt)).ToList();
    }

    public async Task<SmsPreferenceDto> GetPreferencesAsync(Guid restaurantId)
    {
        var pref = await GetOrBuildPreferenceAsync(restaurantId);
        var custom = new Dictionary<string, string>(DefaultTemplates);
        try
        {
            if (!string.IsNullOrWhiteSpace(pref.TemplatesJson))
            {
                var parsed = JsonSerializer.Deserialize<Dictionary<string, string>>(pref.TemplatesJson);
                if (parsed != null)
                {
                    foreach (var (k, v) in parsed)
                        if (!string.IsNullOrWhiteSpace(v)) custom[k] = v;
                }
            }
        }
        catch { }

        return new SmsPreferenceDto(
            restaurantId,
            pref.OrderConfirmationEnabled,
            pref.OrderStatusEnabled,
            pref.DigitalReceiptEnabled,
            pref.ReservationEnabled,
            pref.PaymentConfirmationEnabled,
            pref.StaffShiftEnabled,
            pref.InventoryAlertEnabled,
            pref.LoyaltyEnabled,
            pref.PromotionalEnabled,
            pref.ManagerAlertPhone,
            custom);
    }

    public async Task<SmsPreferenceDto> UpdatePreferencesAsync(Guid restaurantId, UpdateSmsPreferenceDto dto)
    {
        var pref = await db.SmsPreferences.FirstOrDefaultAsync(p => p.RestaurantId == restaurantId);
        if (pref == null)
        {
            pref = new SmsPreference { RestaurantId = restaurantId };
            db.SmsPreferences.Add(pref);
        }

        if (dto.OrderConfirmationEnabled.HasValue) pref.OrderConfirmationEnabled = dto.OrderConfirmationEnabled.Value;
        if (dto.OrderStatusEnabled.HasValue) pref.OrderStatusEnabled = dto.OrderStatusEnabled.Value;
        if (dto.DigitalReceiptEnabled.HasValue) pref.DigitalReceiptEnabled = dto.DigitalReceiptEnabled.Value;
        if (dto.ReservationEnabled.HasValue) pref.ReservationEnabled = dto.ReservationEnabled.Value;
        if (dto.PaymentConfirmationEnabled.HasValue) pref.PaymentConfirmationEnabled = dto.PaymentConfirmationEnabled.Value;
        if (dto.StaffShiftEnabled.HasValue) pref.StaffShiftEnabled = dto.StaffShiftEnabled.Value;
        if (dto.InventoryAlertEnabled.HasValue) pref.InventoryAlertEnabled = dto.InventoryAlertEnabled.Value;
        if (dto.LoyaltyEnabled.HasValue) pref.LoyaltyEnabled = dto.LoyaltyEnabled.Value;
        if (dto.PromotionalEnabled.HasValue) pref.PromotionalEnabled = dto.PromotionalEnabled.Value;
        if (dto.ManagerAlertPhone != null) pref.ManagerAlertPhone = dto.ManagerAlertPhone.Trim();
        if (dto.Templates != null) pref.TemplatesJson = JsonSerializer.Serialize(dto.Templates);
        pref.UpdatedAt = DateTime.UtcNow;

        await db.SaveChangesAsync();
        return await GetPreferencesAsync(restaurantId);
    }

    public async Task<SmsConnectivityDto> CheckConnectivityAsync(Guid restaurantId)
    {
        var restaurant = await db.Restaurants.FindAsync(restaurantId);
        var cfg = ResolveConfig(restaurant);
        if (string.IsNullOrWhiteSpace(cfg.BaseUrl) || string.IsNullOrWhiteSpace(cfg.ApiKey))
            return new SmsConnectivityDto(false, "Base URL or API key is not configured.", 0, []);

        try
        {
            var client = clients.CreateClient();
            client.Timeout = TimeSpan.FromSeconds(8);
            using var req = new HttpRequestMessage(HttpMethod.Get, $"{cfg.BaseUrl.TrimEnd('/')}/gateway/devices");
            req.Headers.Add("x-api-key", cfg.ApiKey);

            using var res = await client.SendAsync(req);
            var body = await res.Content.ReadAsStringAsync();
            if (!res.IsSuccessStatusCode)
                return new SmsConnectivityDto(false, $"Gateway responded HTTP {(int)res.StatusCode}.", 0, []);

            var devices = new List<TextBeeDeviceDto>();
            try
            {
                using var doc = JsonDocument.Parse(body);
                var arr = doc.RootElement.ValueKind == JsonValueKind.Array
                    ? doc.RootElement
                    : doc.RootElement.TryGetProperty("data", out var d) && d.ValueKind == JsonValueKind.Array ? d : default;

                if (arr.ValueKind == JsonValueKind.Array)
                {
                    foreach (var el in arr.EnumerateArray())
                    {
                        var id = el.TryGetProperty("_id", out var pId) ? pId.GetString() ?? "" : "";
                        var name = el.TryGetProperty("name", out var pName) ? pName.GetString() ?? "Android Device" : "Android Device";
                        var enabled = el.TryGetProperty("enabled", out var pEn) && pEn.ValueKind == JsonValueKind.True;
                        var seen = el.TryGetProperty("lastHeartbeat", out var pSeen) ? pSeen.GetString() : null;
                        devices.Add(new TextBeeDeviceDto(id, name, enabled, seen));
                    }
                }
            }
            catch { }

            return new SmsConnectivityDto(true, $"Connected ({devices.Count} device(s) found).", devices.Count, devices);
        }
        catch (Exception ex)
        {
            return new SmsConnectivityDto(false, $"Unreachable: {ex.Message}", 0, []);
        }
    }

    public async Task<bool> ProcessWebhookAsync(TextBeeWebhookDto payload, string? signatureHeader, string rawBody)
    {
        var secret = options.Value.WebhookSecret;
        if (!string.IsNullOrWhiteSpace(secret))
        {
            if (string.IsNullOrWhiteSpace(signatureHeader)) return false;
            var expected = Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), Encoding.UTF8.GetBytes(rawBody)));
            var supplied = signatureHeader.Replace("sha256=", "", StringComparison.OrdinalIgnoreCase).Trim();
            if (!CryptographicOperations.FixedTimeEquals(
                Encoding.UTF8.GetBytes(expected.ToUpperInvariant()),
                Encoding.UTF8.GetBytes(supplied.ToUpperInvariant())))
            {
                logger.LogWarning("Rejected TextBee webhook with invalid signature.");
                return false;
            }
        }

        var matchKey = !string.IsNullOrWhiteSpace(payload.SmsBatchId) ? payload.SmsBatchId : payload.SmsId;
        if (string.IsNullOrWhiteSpace(matchKey)) return false;

        var log = await db.SmsLogs
            .OrderByDescending(l => l.CreatedAt)
            .FirstOrDefaultAsync(l => l.ProviderMessageId == matchKey);

        if (log == null) return true;

        var evt = (payload.Status ?? payload.Event ?? "").ToUpperInvariant();
        if (evt.Contains("DELIVERED"))
        {
            log.Status = "DELIVERED";
            log.DeliveredAt = DateTime.UtcNow;
        }
        else if (evt.Contains("FAIL"))
        {
            log.Status = "FAILED";
            log.ErrorMessage = payload.Error ?? "Delivery failed";
        }
        else if (evt.Contains("SENT"))
        {
            log.Status = "SENT";
            log.SentAt ??= DateTime.UtcNow;
        }
        log.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return true;
    }

    public async Task SetConsentAsync(Guid restaurantId, string phoneNumber, bool promotionalOptIn, bool optedOut)
    {
        var normalized = NormalizePhone(phoneNumber) ?? phoneNumber.Trim();
        var consent = await db.SmsConsents
            .FirstOrDefaultAsync(c => c.RestaurantId == restaurantId && c.CustomerPhone == normalized);
        if (consent == null)
        {
            consent = new SmsConsent { RestaurantId = restaurantId, CustomerPhone = normalized };
            db.SmsConsents.Add(consent);
        }
        consent.PromotionalOptIn = promotionalOptIn && !optedOut;
        consent.OptedOut = optedOut;
        consent.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
    }
}
