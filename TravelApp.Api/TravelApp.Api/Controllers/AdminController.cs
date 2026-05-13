using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TravelApp.Api.Data;

namespace TravelApp.Api.Controllers;

/// <summary>
/// Admin-only endpoints. Locked behind [Authorize(Roles="Admin")].
/// JWT carries the Role claim (see AuthController.GenerateToken).
/// </summary>
[ApiController]
[Route("api/admin")]
[Authorize(Roles = "Admin")]
public class AdminController : ControllerBase
{
    private readonly AppDbContext _db;
    private readonly ILogger<AdminController> _logger;

    public AdminController(AppDbContext db, ILogger<AdminController> logger)
    {
        _db = db;
        _logger = logger;
    }

    // ── Users overview ─────────────────────────────────────────────────
    [HttpGet("users")]
    public async Task<ActionResult<List<AdminUserDto>>> ListUsers([FromQuery] string? email)
    {
        var query = _db.Users.AsNoTracking().AsQueryable();
        if (!string.IsNullOrWhiteSpace(email))
            query = query.Where(u => u.Email.Contains(email.Trim().ToLower()));

        var rows = await query
            .OrderBy(u => u.Email)
            .Select(u => new AdminUserDto
            {
                Id        = u.Id,
                Email     = u.Email,
                Name      = u.Name,
                HomeCity  = u.HomeCity,
                Role      = string.IsNullOrWhiteSpace(u.Role) ? "User" : u.Role,
                CreatedAt = u.CreatedAt,
                RouteCount = _db.TravelRoutes.Count(r => r.UserId == u.Id)
            })
            .ToListAsync();

        return Ok(rows);
    }

    [HttpDelete("users/{id:int}")]
    public async Task<IActionResult> DeleteUser(int id)
    {
        var user = await _db.Users.FindAsync(id);
        if (user is null) return NotFound();

        // Don't let an admin delete themselves by accident.
        var meEmail = User.Identity?.Name;
        if (string.Equals(user.Email, meEmail, StringComparison.OrdinalIgnoreCase))
            return BadRequest(new { message = "Нельзя удалить собственный аккаунт." });

        _db.Users.Remove(user);
        await _db.SaveChangesAsync();
        _logger.LogWarning("Admin deleted user {Id} ({Email}).", id, user.Email);
        return NoContent();
    }

    // ── Routes overview ────────────────────────────────────────────────
    [HttpGet("routes")]
    public async Task<ActionResult<List<AdminRouteDto>>> ListRoutes(
        [FromQuery] int?    userId,
        [FromQuery] string? tag,
        [FromQuery] string? from,
        [FromQuery] string? to)
    {
        var query = _db.TravelRoutes.AsNoTracking().AsQueryable();

        if (userId is int uid) query = query.Where(r => r.UserId == uid);
        if (!string.IsNullOrWhiteSpace(tag))
            query = query.Where(r => r.Tags.ToLower().Contains(tag.Trim().ToLower()));
        if (DateTime.TryParse(from, out var fromDt))
            query = query.Where(r => r.CreatedAt >= fromDt);
        if (DateTime.TryParse(to, out var toDt))
            query = query.Where(r => r.CreatedAt <  toDt.AddDays(1));

        var rows = await query
            .OrderByDescending(r => r.CreatedAt)
            .Select(r => new AdminRouteDto
            {
                Id           = r.Id,
                Title        = r.Title,
                CityName     = r.City != null ? r.City.Name : "",
                UserId       = r.UserId,
                UserEmail    = r.User != null ? r.User.Email : "",
                Tags         = r.Tags,
                DurationDays = r.DurationDays,
                CreatedAt    = r.CreatedAt,
                StopCount    = r.Stops.Count
            })
            .ToListAsync();

        return Ok(rows);
    }

    [HttpDelete("routes/{id:int}")]
    public async Task<IActionResult> DeleteRoute(int id)
    {
        var route = await _db.TravelRoutes.FindAsync(id);
        if (route is null) return NotFound();
        _db.TravelRoutes.Remove(route);
        await _db.SaveChangesAsync();
        _logger.LogWarning("Admin deleted route {Id} ({Title}).", id, route.Title);
        return NoContent();
    }

    /// <summary>
    /// Admin-only "view any user's route" — returns the same shape as
    /// /api/user-routes/:id so the SavedRouteComponent can render it
    /// unchanged. Includes the owner's email/name in the response so the
    /// admin sees whose route they're looking at.
    /// </summary>
    [HttpGet("routes/{id:int}")]
    public async Task<ActionResult<AdminRouteDetailsDto>> GetRoute(int id)
    {
        var route = await _db.TravelRoutes
            .AsNoTracking()
            .Include(r => r.City)
            .Include(r => r.User)
            .Include(r => r.Stops)
            .FirstOrDefaultAsync(r => r.Id == id);

        if (route is null) return NotFound();

        var dto = new AdminRouteDetailsDto
        {
            Id           = route.Id,
            Title        = route.Title,
            CityId       = route.CityId,
            CityName     = route.City?.Name ?? "",
            DurationDays = route.DurationDays,
            Theme        = route.Theme,
            Tags         = route.Tags,
            AiSummary    = route.AiSummary,
            CreatedAt    = route.CreatedAt,
            OwnerId      = route.UserId,
            OwnerEmail   = route.User?.Email ?? "",
            OwnerName    = route.User?.Name  ?? "",
            Stops = route.Stops
                .OrderBy(s => s.DayNumber).ThenBy(s => s.StopOrder)
                .Select(s => new AdminRouteStopDto
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

        return Ok(dto);
    }
}

public class AdminRouteDetailsDto
{
    public int      Id           { get; set; }
    public string   Title        { get; set; } = "";
    public int      CityId       { get; set; }
    public string   CityName     { get; set; } = "";
    public int      DurationDays { get; set; }
    public string   Theme        { get; set; } = "";
    public string   Tags         { get; set; } = "";
    public string   AiSummary    { get; set; } = "";
    public DateTime CreatedAt    { get; set; }
    public int?     OwnerId      { get; set; }
    public string   OwnerEmail   { get; set; } = "";
    public string   OwnerName    { get; set; } = "";
    public List<AdminRouteStopDto> Stops { get; set; } = new();
}

public class AdminRouteStopDto
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

public class AdminUserDto
{
    public int      Id        { get; set; }
    public string   Email     { get; set; } = "";
    public string   Name      { get; set; } = "";
    public string   HomeCity  { get; set; } = "";
    public string   Role      { get; set; } = "User";
    public DateTime CreatedAt { get; set; }
    public int      RouteCount { get; set; }
}

public class AdminRouteDto
{
    public int      Id           { get; set; }
    public string   Title        { get; set; } = "";
    public string   CityName     { get; set; } = "";
    public int?     UserId       { get; set; }
    public string   UserEmail    { get; set; } = "";
    public string   Tags         { get; set; } = "";
    public int      DurationDays { get; set; }
    public DateTime CreatedAt    { get; set; }
    public int      StopCount    { get; set; }
}
