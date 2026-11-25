namespace RestaurantSystem.Api.Models;

public record DiningLayoutDefinition(Guid TableId, int TableNumber, int Capacity, string DisplayName, string SeatingStyle, string QrSuffix);

public static class DiningLayoutCatalog
{
    public static readonly Guid DefaultRestaurantId = Guid.Parse("a0000000-0000-0000-0000-000000000001");

    // These identities belong to the supplied restaurant layout; ordinary tables keep their existing identity.
    public static readonly IReadOnlyList<DiningLayoutDefinition> Definitions = new[]
    {
        new DiningLayoutDefinition(Guid.Parse("c1000000-0000-0000-0000-000000000001"), 101, 14, "C1", "chairs", "FAMILY_C1"),
        new DiningLayoutDefinition(Guid.Parse("c1000000-0000-0000-0000-000000000002"), 102, 14, "C2", "chairs", "FAMILY_C2"),
        new DiningLayoutDefinition(Guid.Parse("c1000000-0000-0000-0000-000000000003"), 103, 16, "C3", "sofas", "FAMILY_C3"),
        new DiningLayoutDefinition(Guid.Parse("c1000000-0000-0000-0000-000000000004"), 104, 16, "C4", "mixed", "FAMILY_C4"),
        new DiningLayoutDefinition(Guid.Parse("c2000000-0000-0000-0000-000000000001"), 201, 70, "Party hall", "hall", "PARTY_HALL"),
    };

    public static string QrIdentifier(DiningLayoutDefinition definition) => QrIdentifier(DefaultRestaurantId, definition);

    public static string QrIdentifier(Guid restaurantId, DiningLayoutDefinition definition) => $"DINING_{restaurantId:N}_{definition.QrSuffix}";

    public static DiningLayoutDefinition? Find(string? qrIdentifier, int tableNumber = 0)
    {
        if (!string.IsNullOrEmpty(qrIdentifier))
        {
            var match = Definitions.FirstOrDefault(d =>
                string.Equals(qrIdentifier, QrIdentifier(d), StringComparison.OrdinalIgnoreCase) ||
                qrIdentifier.EndsWith(d.QrSuffix, StringComparison.OrdinalIgnoreCase));
            if (match != null) return match;
        }

        if (tableNumber > 0)
        {
            return Definitions.FirstOrDefault(d => d.TableNumber == tableNumber);
        }

        return null;
    }

    public static string Area(int capacity, string? qrIdentifier = null, int tableNumber = 0)
    {
        if (tableNumber == 201 || (qrIdentifier != null && qrIdentifier.EndsWith("PARTY_HALL", StringComparison.OrdinalIgnoreCase)))
            return "party";

        if ((tableNumber >= 101 && tableNumber <= 104) || (qrIdentifier != null && qrIdentifier.Contains("FAMILY_C", StringComparison.OrdinalIgnoreCase)) || capacity > 10)
            return "family";

        if (tableNumber is 6 or 7 or 8 or 12 || capacity > 4)
            return "group";

        return "everyday";
    }

    public static string DisplayName(int tableNumber, string? qrIdentifier = null)
    {
        if (tableNumber == 201 || (qrIdentifier != null && qrIdentifier.EndsWith("PARTY_HALL", StringComparison.OrdinalIgnoreCase)))
            return "Party hall";

        if (tableNumber >= 101 && tableNumber <= 104)
            return $"C{tableNumber - 100}";

        if (qrIdentifier != null && qrIdentifier.Contains("FAMILY_C", StringComparison.OrdinalIgnoreCase))
        {
            var found = Find(qrIdentifier, tableNumber);
            if (found != null) return found.DisplayName;
        }

        return $"A{tableNumber}";
    }

    public static string SeatingStyle(int capacity, string? qrIdentifier = null, int tableNumber = 0)
    {
        if (tableNumber == 201 || (qrIdentifier != null && qrIdentifier.EndsWith("PARTY_HALL", StringComparison.OrdinalIgnoreCase)))
            return "hall";

        if (tableNumber == 103 || (qrIdentifier != null && qrIdentifier.EndsWith("FAMILY_C3", StringComparison.OrdinalIgnoreCase)))
            return "sofas";

        if (tableNumber == 104 || (qrIdentifier != null && qrIdentifier.EndsWith("FAMILY_C4", StringComparison.OrdinalIgnoreCase)))
            return "mixed";

        if ((tableNumber >= 101 && tableNumber <= 104) || capacity > 10)
            return "chairs";

        return "standard";
    }
}
