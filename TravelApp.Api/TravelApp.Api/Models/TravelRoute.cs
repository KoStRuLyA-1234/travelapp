namespace TravelApp.Api.Models;

public class TravelRoute
{
    public int Id { get; set; }
    public int CityId { get; set; }
    public int? UserId { get; set; }
    public string Title { get; set; } = "";
    public string Description { get; set; } = "";
    public int DurationDays { get; set; } = 1;
    public string Theme { get; set; } = "";
    public string Difficulty { get; set; } = "easy";
    public decimal? EstimatedBudget { get; set; }
    public bool IsGenerated { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    // ── AI-route extensions (added 2026-05-05 for "save AI route" feature) ──
    /// <summary>Free-form text summary the model produced. Shown under the map.</summary>
    public string AiSummary { get; set; } = "";
    /// <summary>Comma-separated tags ("культура,море,природа") — auto-derived from city + style.</summary>
    public string Tags { get; set; } = "";
    /// <summary>True when the row was created via /api/guide/route (AI flow).</summary>
    public bool IsAiGenerated { get; set; }
    /// <summary>Stable hash of (UserId + CityId + Days + first place names) — idempotency key.</summary>
    public string ContentHash { get; set; } = "";

    public City? City { get; set; }
    public User? User { get; set; }
    public List<RouteStop> Stops { get; set; } = new();
}
