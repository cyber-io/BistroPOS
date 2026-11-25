using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;

namespace RestaurantSystem.Api.Security;

// Capability tokens let an anonymous guest follow or confirm only the order/help request they created.
public sealed class ResourceTokens(IOptions<JwtOptions> jwtOptions, IOptions<SecurityOptions> securityOptions)
{
    private byte[] GetSigningKey()
    {
        var configured = securityOptions.Value.ResourceTokenKey;
        if (!string.IsNullOrWhiteSpace(configured))
        {
            return Encoding.UTF8.GetBytes(configured);
        }

        // Domain-separate fallback key so capability signatures never reuse raw JWT signing bytes.
        var jwtSecret = jwtOptions.Value.SecretKey;
        if (string.IsNullOrWhiteSpace(jwtSecret))
        {
            throw new InvalidOperationException("Security:ResourceTokenKey or Jwt:SecretKey must be configured.");
        }

        return SHA256.HashData(Encoding.UTF8.GetBytes($"BistroPOS:ResourceTokenKey:v2:{jwtSecret}"));
    }

    public string Create(string resource, Guid id)
    {
        var ttlHours = Math.Clamp(securityOptions.Value.ResourceTokenHours, 1, 168);
        var exp = DateTimeOffset.UtcNow.AddHours(ttlHours).ToUnixTimeSeconds();
        var payload = $"v2:{resource}:{id}:{exp}";
        var sig = ComputeHexSignature(payload);
        return $"{exp}.{sig}";
    }

    public bool Validate(string resource, Guid id, string? token)
    {
        if (string.IsNullOrWhiteSpace(token)) return false;

        var parts = token.Split('.', 2);
        if (parts.Length != 2 || !long.TryParse(parts[0], out var exp))
        {
            return false;
        }

        if (DateTimeOffset.UtcNow.ToUnixTimeSeconds() > exp)
        {
            return false;
        }

        var expected = Encoding.UTF8.GetBytes(ComputeHexSignature($"v2:{resource}:{id}:{exp}"));
        var supplied = Encoding.UTF8.GetBytes(parts[1].ToLowerInvariant());
        return supplied.Length == expected.Length && CryptographicOperations.FixedTimeEquals(supplied, expected);
    }

    private string ComputeHexSignature(string payload)
    {
        using var hmac = new HMACSHA256(GetSigningKey());
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes(payload))).ToLowerInvariant();
    }
}
