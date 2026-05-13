using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api")]
    public class TravelRoutesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public TravelRoutesController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("cities/{cityId:int}/routes")]
        public async Task<ActionResult<List<TravelRouteDto>>> GetCityRoutes(int cityId)
        {
            var cityExists = await _context.Cities.AnyAsync(c => c.Id == cityId);
            if (!cityExists) return NotFound(new { message = "Город не найден" });

            var routes = await _context.TravelRoutes.AsNoTracking()
                .Include(r => r.Stops)
                    .ThenInclude(s => s.Attraction)
                .Where(r => r.CityId == cityId)
                .OrderBy(r => r.DurationDays)
                .ThenBy(r => r.Title)
                .ToListAsync();

            return routes.Select(ToDto).ToList();
        }

        [Authorize]
        [HttpPost("cities/{cityId:int}/routes")]
        public async Task<ActionResult<TravelRouteDto>> CreateRoute(int cityId, [FromBody] CreateTravelRouteRequest request)
        {
            var cityExists = await _context.Cities.AnyAsync(c => c.Id == cityId);
            if (!cityExists) return NotFound(new { message = "Город не найден" });

            if (string.IsNullOrWhiteSpace(request.Title))
                return BadRequest(new { message = "Укажите название маршрута" });

            var route = new TravelRoute
            {
                CityId = cityId,
                UserId = GetUserId(),
                Title = request.Title.Trim(),
                Description = request.Description?.Trim() ?? "",
                DurationDays = Math.Max(1, request.DurationDays),
                Theme = request.Theme?.Trim() ?? "",
                Difficulty = request.Difficulty?.Trim() ?? "easy",
                EstimatedBudget = request.EstimatedBudget,
                CreatedAt = DateTime.UtcNow
            };

            foreach (var stop in request.Stops.OrderBy(s => s.DayNumber).ThenBy(s => s.StopOrder))
            {
                route.Stops.Add(new RouteStop
                {
                    AttractionId = stop.AttractionId,
                    DayNumber = Math.Max(1, stop.DayNumber),
                    StopOrder = Math.Max(1, stop.StopOrder),
                    StartTime = stop.StartTime?.Trim() ?? "",
                    DurationMinutes = Math.Max(15, stop.DurationMinutes),
                    Note = stop.Note?.Trim() ?? ""
                });
            }

            _context.TravelRoutes.Add(route);
            await _context.SaveChangesAsync();

            var created = await _context.TravelRoutes.AsNoTracking()
                .Include(r => r.Stops)
                    .ThenInclude(s => s.Attraction)
                .Where(r => r.Id == route.Id)
                .FirstAsync();

            return CreatedAtAction(nameof(GetCityRoutes), new { cityId }, ToDto(created));
        }

        private int GetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : throw new InvalidOperationException("User id claim is missing.");
        }

        private static TravelRouteDto ToDto(TravelRoute route) => new()
        {
            Id = route.Id,
            CityId = route.CityId,
            Title = route.Title,
            Description = route.Description,
            DurationDays = route.DurationDays,
            Theme = route.Theme,
            Difficulty = route.Difficulty,
            EstimatedBudget = route.EstimatedBudget,
            IsGenerated = route.IsGenerated,
            Stops = route.Stops
                .OrderBy(s => s.DayNumber)
                .ThenBy(s => s.StopOrder)
                .Select(s => new RouteStopDto
                {
                    Id = s.Id,
                    AttractionId = s.AttractionId,
                    AttractionName = s.Attraction != null ? s.Attraction.Name : s.PlaceName,
                    DayNumber = s.DayNumber,
                    StopOrder = s.StopOrder,
                    StartTime = s.StartTime,
                    DurationMinutes = s.DurationMinutes,
                    Note = s.Note
                })
                .ToList()
        };
    }

    public class CreateTravelRouteRequest
    {
        public string Title { get; set; } = "";
        public string? Description { get; set; }
        public int DurationDays { get; set; } = 1;
        public string? Theme { get; set; }
        public string? Difficulty { get; set; }
        public decimal? EstimatedBudget { get; set; }
        public List<CreateRouteStopRequest> Stops { get; set; } = new();
    }

    public class CreateRouteStopRequest
    {
        public int AttractionId { get; set; }
        public int DayNumber { get; set; } = 1;
        public int StopOrder { get; set; } = 1;
        public string? StartTime { get; set; }
        public int DurationMinutes { get; set; } = 90;
        public string? Note { get; set; }
    }

    public class TravelRouteDto
    {
        public int Id { get; set; }
        public int CityId { get; set; }
        public string Title { get; set; } = "";
        public string Description { get; set; } = "";
        public int DurationDays { get; set; }
        public string Theme { get; set; } = "";
        public string Difficulty { get; set; } = "";
        public decimal? EstimatedBudget { get; set; }
        public bool IsGenerated { get; set; }
        public List<RouteStopDto> Stops { get; set; } = new();
    }

    public class RouteStopDto
    {
        public int Id { get; set; }
        public int? AttractionId { get; set; }
        public string AttractionName { get; set; } = "";
        public int DayNumber { get; set; }
        public int StopOrder { get; set; }
        public string StartTime { get; set; } = "";
        public int DurationMinutes { get; set; }
        public string Note { get; set; } = "";
    }
}
