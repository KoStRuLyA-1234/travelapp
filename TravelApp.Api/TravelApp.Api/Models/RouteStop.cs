namespace TravelApp.Api.Models;

public class RouteStop
{
    public int Id { get; set; }
    public int TravelRouteId { get; set; }

    /// <summary>
    /// Nullable now — AI-generated stops often reference places that don't have
    /// an Attraction row in our DB. Fall back to PlaceName/Latitude/Longitude.
    /// </summary>
    public int? AttractionId { get; set; }

    public int DayNumber { get; set; } = 1;
    public int StopOrder { get; set; } = 1;
    public string StartTime { get; set; } = "";
    public int DurationMinutes { get; set; } = 90;
    public string Note { get; set; } = "";

    // ── AI-route extensions (added 2026-05-05) ──────────────────────
    /// <summary>Place name as the model produced it (used when AttractionId is null).</summary>
    public string PlaceName { get; set; } = "";
    /// <summary>Free-form duration string from AI ("1.5 ч"). Kept verbatim for display.</summary>
    public string DurationLabel { get; set; } = "";
    /// <summary>Optional precise coordinates — from Attractions match or stored fallback.</summary>
    public double? Latitude  { get; set; }
    public double? Longitude { get; set; }

    public TravelRoute? TravelRoute { get; set; }
    public Attraction?  Attraction  { get; set; }
}
