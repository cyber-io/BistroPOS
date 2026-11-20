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

    public static string QrIdentifier(DiningLayoutDefinition definition) => $"DINING_{DefaultRestaurantId:N}_{definition.QrSuffix}";

    public static DiningLayoutDefinition? Find(string qrIdentifier) => Definitions.FirstOrDefault(definition =>
        string.Equals(qrIdentifier, QrIdentifier(definition), StringComparison.Ordinal));

    public static string Area(int capacity, string qrIdentifier) => Find(qrIdentifier)?.SeatingStyle == "hall"
        ? "party" : capacity > 10 ? "family" : capacity > 4 ? "group" : "everyday";

    public static string DisplayName(int tableNumber, string qrIdentifier) => Find(qrIdentifier)?.DisplayName ?? $"A{tableNumber}";

    public static string SeatingStyle(int capacity, string qrIdentifier) => Find(qrIdentifier)?.SeatingStyle
        ?? (capacity > 10 ? "chairs" : "standard");
}
