using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using RestaurantSystem.Api.Configuration;

namespace RestaurantSystem.Api.Security;

// Resource capabilities let a guest follow only the order/help request they created.
public sealed class ResourceTokens(IOptions<JwtOptions> options)
{
    public string Create(string resource, Guid id)
    {
        using var hmac = new HMACSHA256(Encoding.UTF8.GetBytes(options.Value.SecretKey));
        return Convert.ToHexString(hmac.ComputeHash(Encoding.UTF8.GetBytes($"v1:{resource}:{id}"))).ToLowerInvariant();
    }
    public bool Validate(string resource, Guid id, string? token)
    {
        if (string.IsNullOrEmpty(token)) return false;
        var expected = Encoding.UTF8.GetBytes(Create(resource, id));
        var supplied = Encoding.UTF8.GetBytes(token);
        return supplied.Length == expected.Length && CryptographicOperations.FixedTimeEquals(supplied, expected);
    }
}
