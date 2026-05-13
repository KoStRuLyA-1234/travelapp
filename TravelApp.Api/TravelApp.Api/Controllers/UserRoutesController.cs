using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers;

/// <summary>
/// CRUD for AI-generated routes that the user chose to save.
/// All endpoints require a valid backend JWT — they always operate on the
/// caller's own routes. The admin panel uses a separate AdminController.
/// </summary>
[ApiController]
[Route("api/user-routes")]
[Authorize]
public class UserRoutesController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<UserRoutesController> _logger;

    public UserRoutesController(AppDbContext db, ILogger<UserRoutesController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ── List my routes (lightweight, no stops) ─────────────────────────
    [HttpGet]
    public async Task<ActionResult<List<SavedRouteSummaryDto>>> List()
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();

        var rows = await _db.TravelRoutes
            .AsNoTracking()
            .Where(r => r.UserId == userId)
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new SavedRouteSummaryDto
            {
                Id           = r.Id,
                Title        = r.Title,
                CityId       = r.CityId,
                CityName     = r.City != null ? r.City.Name : "",
                DurationDays = r.DurationDays,
                Theme        = r.Theme,
                Tags         = r.Tags,
                AiSummary    = r.AiSummary,
                CreatedAt    = r.CreatedAt,
                StopCount    = r.Stops.Count
            })
            .ToListAsync();

        return Ok(rows);
    }

    // ── Get one route with all stops ───────────────────────────────────
    [HttpGet("{id:int}")]
    public async Task<ActionResult<SavedRouteDto>> Get(int id)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();

        var route = await _db.TravelRoutes
            .AsNoTracking()
            .Include(r => r.City)
            .Include(r => r.Stops)
            .FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);

        if (route is null) return NotFound();
        return Ok(MapToDto(route));
    }

    // ── Save a freshly-generated AI route ──────────────────────────────
    // Idempotent: returns existing row when ContentHash matches.
    [HttpPost]
    public async Task<ActionResult<SavedRouteDto>> Save([FromBody] SaveRouteRequest req)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();

        if (req?.Stops is null || req.Stops.Count == 0)
            return BadRequest(new { message = "В маршруте нет ни одной точки." });

        if (string.IsNullOrWhiteSpace(req.Title))
            return BadRequest(new { message = "Название маршрута обязательно." });

        var hash = ComputeContentHash(userId.Value, req);
        var existing = await _db.TravelRoutes
            .Include(r => r.Stops)
            .FirstOrDefaultAsync(r => r.UserId == userId && r.ContentHash == hash);

        if (existing != null)
        {
            _logger.LogInformation("UserRoutes.Save: returning existing route {Id} (hash collision = same input).", existing.Id);
            return Ok(MapToDto(existing));
        }

        var route = new TravelRoute
        {
            UserId         = userId,
            CityId         = req.CityId,
            Title          = req.Title.Trim(),
            Description    = (req.Description ?? "").Trim(),
            DurationDays   = Math.Max(1, req.DurationDays),
            Theme          = (req.Theme ?? "").Trim(),
            Difficulty     = "easy",
            IsGenerated    = true,
            IsAiGenerated  = true,
            AiSummary      = (req.AiSummary ?? "").Trim(),
            Tags           = (req.Tags ?? "").Trim(),
            ContentHash    = hash,
            CreatedAt      = DateTime.UtcNow,
            Stops = req.Stops.Select((s, i) => new RouteStop
            {
                AttractionId    = null,
                PlaceName       = (s.Name ?? "").Trim(),
                DayNumber       = Math.Max(1, s.Day),
                StopOrder       = i + 1,
                StartTime       = (s.Time ?? "").Trim(),
                DurationMinutes = ParseDurationMinutes(s.Duration),
                DurationLabel   = (s.Duration ?? "").Trim(),
                Note            = (s.Tip ?? "").Trim(),
                Latitude        = s.Latitude,
                Longitude       = s.Longitude
            }).ToList()
        };

        _db.TravelRoutes.Add(route);
        await _db.SaveChangesAsync();

        _logger.LogInformation("UserRoutes.Save: stored route id={Id} for user {Uid} ({Stops} stops).",
            route.Id, userId, route.Stops.Count);

        // Reload with City for the response.
        await _db.Entry(route).Reference(r => r.City).LoadAsync();
        return Ok(MapToDto(route));
    }

    // ── Delete one of MY routes ────────────────────────────────────────
    [HttpDelete("{id:int}")]
    public async Task<IActionResult> Delete(int id)
    {
        var userId = CurrentUserId();
        if (userId is null) return Unauthorized();

        var route = await _db.TravelRoutes.FirstOrDefaultAsync(r => r.Id == id && r.UserId == userId);
        if (route is null) return NotFound();

        _db.TravelRoutes.Remove(route);   // cascade also drops Stops
        await _db.SaveChangesAsync();
        return NoContent();
    }

    // ── helpers ───────────────────────────────────────────────────────
    private int? CurrentUserId()
    {
        var v = User.FindFirstValue(ClaimTypes.NameIdentifier);
        return int.TryParse(v, out var id) ? id : null;
    }

    private static SavedRouteDto MapToDto(TravelRoute r) => new()
    {
        Id           = r.Id,
        Title        = r.Title,
        CityId       = r.CityId,
        CityName     = r.City?.Name ?? "",
        DurationDays = r.DurationDays,
        Theme        = r.Theme,
        Tags         = r.Tags,
        AiSummary    = r.AiSummary,
        CreatedAt    = r.CreatedAt,
        Stops = r.Stops
            .OrderBy(s => s.DayNumber).ThenBy(s => s.StopOrder)
            .Select(s => new SavedRouteStopDto
            {
                Day       = s.DayNumber,
                Order     = s.StopOrder,
                Name      = s.PlaceName,
                Time      = s.StartTime,
                Duration  = s.DurationLabel,
                Tip       = s.Note,
                Latitude  = s.Latitude,
                Longitude = s.Longitude
            })
            .ToList()
    };

    /// <summary>Stable hash of the route's identity — used to dedupe re-saves.</summary>
    internal static string ComputeContentHash(int userId, SaveRouteRequest req)
    {
        var seed = $"{userId}|{req.CityId}|{req.Title?.Trim()}|{req.DurationDays}|"
                 + string.Join(",", req.Stops.Take(8).Select(s => (s.Name ?? "").Trim().ToLowerInvariant()));
        var bytes = Encoding.UTF8.GetBytes(seed);
        var hash = SHA256.HashData(bytes);
        return Convert.ToHexString(hash)[..32];
    }

    /// <summary>"1.5 ч" / "90 мин" / "2 часа" → minutes (fallback 60).</summary>
    private static int ParseDurationMinutes(string? raw)
    {
        if (string.IsNullOrWhiteSpace(raw)) return 60;
        var s = raw.Trim().ToLowerInvariant().Replace(',', '.');
        if (double.TryParse(s.Split(' ')[0], System.Globalization.NumberStyles.Any,
                            System.Globalization.CultureInfo.InvariantCulture, out var num))
        {
            // "ч"/"час" → hours, otherwise minutes.
            return s.Contains('ч') ? Math.Max(15, (int)Math.Round(num * 60))
                                   : Math.Max(15, (int)Math.Round(num));
        }
        return 60;
    }
}

// ── DTOs ────────────────────────────────────────────────────────────────
public class SaveRouteRequest
{
    public int CityId { get; set; }
    public string Title { get; set; } = "";
    public string? Description { get; set; }
    public int DurationDays { get; set; } = 1;
    public string? Theme { get; set; }
    public string? Tags { get; set; }
    public string? AiSummary { get; set; }
    public List<SaveRouteStopRequest> Stops { get; set; } = new();
}

public class SaveRouteStopRequest
{
    public int Day { get; set; } = 1;
    public string Name { get; set; } = "";
    public string? Time { get; set; }
    public string? Duration { get; set; }
    public string? Tip { get; set; }
    public double? Latitude { get; set; }
    public double? Longitude { get; set; }
}

public class SavedRouteSummaryDto
{
    public int    Id           { get; set; }
    public string Title        { get; set; } = "";
    public int    CityId       { get; set; }
    public string CityName     { get; set; } = "";
    public int    DurationDays { get; set; }
    public string Theme        { get; set; } = "";
    public string Tags         { get; set; } = "";
    public string AiSummary    { get; set; } = "";
    public DateTime CreatedAt  { get; set; }
    public int    StopCount    { get; set; }
}

public class SavedRouteDto
{
    public int    Id           { get; set; }
    public string Title        { get; set; } = "";
    public int    CityId       { get; set; }
    public string CityName     { get; set; } = "";
    public int    DurationDays { get; set; }
    public string Theme        { get; set; } = "";
    public string Tags         { get; set; } = "";
    public string AiSummary    { get; set; } = "";
    public DateTime CreatedAt  { get; set; }
    public List<SavedRouteStopDto> Stops { get; set; } = new();
}

public class SavedRouteStopDto
{
    public int     Day       { get; set; }
    public int     Order     { get; set; }
    public string  Name      { get; set; } = "";
    public string  Time      { get; set; } = "";
    public string  Duration  { get; set; } = "";
    public string  Tip       { get; set; } = "";
    public double? Latitude  { get; set; }
    public double? Longitude { get; set; }
}
