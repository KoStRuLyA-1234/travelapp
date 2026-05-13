using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using TravelApp.Api.Data;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AttractionsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public AttractionsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public async Task<ActionResult<List<AttractionDto>>> Get([FromQuery] int? cityId, [FromQuery] string? type, [FromQuery] string? q)
        {
            var attractions = _context.Attractions.AsNoTracking();

            if (cityId.HasValue)
                attractions = attractions.Where(a => a.CityId == cityId.Value);

            if (!string.IsNullOrWhiteSpace(type))
                attractions = attractions.Where(a => EF.Functions.ILike(a.Type, type.Trim()));

            if (!string.IsNullOrWhiteSpace(q))
            {
                var query = $"%{q.Trim()}%";
                attractions = attractions.Where(a =>
                    EF.Functions.ILike(a.Name, query) ||
                    EF.Functions.ILike(a.Description, query) ||
                    EF.Functions.ILike(a.Address, query));
            }

            return await attractions
                .OrderBy(a => a.Type)
                .ThenBy(a => a.Name)
                .Select(a => new AttractionDto
                {
                    Id = a.Id,
                    CityId = a.CityId,
                    Name = a.Name,
                    Description = a.Description,
                    Type = a.Type,
                    Address = a.Address,
                    ImageUrl = a.ImageUrl,
                    Latitude = a.Latitude,
                    Longitude = a.Longitude,
                    AverageVisitMinutes = a.AverageVisitMinutes,
                    PriceLevel = a.PriceLevel,
                    IsFree = a.IsFree
                })
                .ToListAsync();
        }

        [HttpGet("~/api/cities/{cityId:int}/attractions")]
        public Task<ActionResult<List<AttractionDto>>> GetByCity(int cityId)
        {
            return Get(cityId, null, null);
        }
    }
}
