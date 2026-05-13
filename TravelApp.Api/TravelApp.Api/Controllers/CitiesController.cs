using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using System.Text.Json;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CitiesController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IHttpClientFactory _httpFactory;

        public CitiesController(AppDbContext context, IHttpClientFactory httpFactory)
        {
            _context = context;
            _httpFactory = httpFactory;
        }

        [HttpGet]
        public async Task<ActionResult<List<CityListDto>>> Get([FromQuery] CityQuery query)
        {
            var userId = GetUserId();
            var cities = _context.Cities.AsNoTracking();

            if (!string.IsNullOrWhiteSpace(query.Q))
            {
                var q = $"%{query.Q.Trim()}%";
                cities = cities.Where(c =>
                    EF.Functions.ILike(c.Name, q) ||
                    EF.Functions.ILike(c.Description, q) ||
                    EF.Functions.ILike(c.Tags, q) ||
                    c.Attractions.Any(a =>
                        EF.Functions.ILike(a.Name, q) ||
                        EF.Functions.ILike(a.Description, q)));
            }

            if (!string.IsNullOrWhiteSpace(query.Region))
            {
                var region = query.Region.Trim();
                cities = cities.Where(c => EF.Functions.ILike(c.Region, region));
            }

            if (!string.IsNullOrWhiteSpace(query.Type))
            {
                var type = query.Type.Trim();
                cities = cities.Where(c => c.Attractions.Any(a => EF.Functions.ILike(a.Type, type)));
            }

            if (query.FavoritesOnly && userId.HasValue)
                cities = cities.Where(c => c.Favorites.Any(f => f.UserId == userId.Value));

            return await cities
                .OrderByDescending(c => c.Rating)
                .ThenBy(c => c.Name)
                .Select(c => new CityListDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Description = c.Description,
                    ImageUrl = c.ImageUrl,
                    Rating = c.Reviews.Any() ? Math.Round(c.Reviews.Average(r => r.Rating), 1) : c.Rating,
                    Population = c.Population,
                    Tags = c.Tags,
                    SearchQuery = c.SearchQuery,
                    Region = c.Region,
                    Latitude = c.Latitude,
                    Longitude = c.Longitude,
                    BestSeason = c.BestSeason,
                    AverageTripDays = c.AverageTripDays,
                    IsFavorite = userId.HasValue && c.Favorites.Any(f => f.UserId == userId.Value),
                    ReviewsCount = c.Reviews.Count,
                    AttractionsCount = c.Attractions.Count
                })
                .ToListAsync();
        }

        [HttpGet("filters")]
        public async Task<ActionResult<CityFiltersDto>> GetFilters()
        {
            var regions = await _context.Cities.AsNoTracking()
                .Where(c => c.Region != "")
                .Select(c => c.Region)
                .Distinct()
                .OrderBy(r => r)
                .ToListAsync();

            var attractionTypes = await _context.Attractions.AsNoTracking()
                .Where(a => a.Type != "")
                .Select(a => a.Type)
                .Distinct()
                .OrderBy(t => t)
                .ToListAsync();

            return Ok(new CityFiltersDto(regions, attractionTypes));
        }

        [HttpGet("{id:int}")]
        public async Task<ActionResult<CityDetailDto>> GetById(int id)
        {
            var userId = GetUserId();
            var city = await _context.Cities
                .AsNoTracking()
                .Where(c => c.Id == id)
                .Select(c => new CityDetailDto
                {
                    Id = c.Id,
                    Name = c.Name,
                    Description = c.Description,
                    ImageUrl = c.ImageUrl,
                    Rating = c.Reviews.Any() ? Math.Round(c.Reviews.Average(r => r.Rating), 1) : c.Rating,
                    Population = c.Population,
                    Tags = c.Tags,
                    SearchQuery = c.SearchQuery,
                    Region = c.Region,
                    Latitude = c.Latitude,
                    Longitude = c.Longitude,
                    BestSeason = c.BestSeason,
                    AverageTripDays = c.AverageTripDays,
                    IsFavorite = userId.HasValue && c.Favorites.Any(f => f.UserId == userId.Value),
                    ReviewsCount = c.Reviews.Count,
                    AttractionsCount = c.Attractions.Count,
                    Attractions = c.Attractions
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
                        .ToList()
                })
                .FirstOrDefaultAsync();

            return city is null ? NotFound() : Ok(city);
        }

        [HttpGet("{id:int}/photo")]
        public async Task<ActionResult<object>> GetCityPhoto(int id)
        {
            var city = await _context.Cities.FirstOrDefaultAsync(c => c.Id == id);
            if (city == null) return NotFound();

            if (!string.IsNullOrEmpty(city.ImageUrl) && city.ImageUrl.StartsWith("http"))
                return Ok(new { url = city.ImageUrl });

            var http = _httpFactory.CreateClient();
            http.DefaultRequestHeaders.UserAgent.ParseAdd("TravelApp/1.0");

            try
            {
                var url = $"https://ru.wikipedia.org/api/rest_v1/page/summary/{Uri.EscapeDataString(city.Name)}";
                var response = await http.GetStringAsync(url);
                using var json = JsonDocument.Parse(response);

                if (json.RootElement.TryGetProperty("thumbnail", out var thumb) &&
                    thumb.TryGetProperty("source", out var source))
                {
                    var photoUrl = source.GetString() ?? "";
                    city.ImageUrl = photoUrl;
                    await _context.SaveChangesAsync();
                    return Ok(new { url = photoUrl });
                }
            }
            catch
            {
                // Photo enrichment is best-effort; the city itself must still be usable.
            }

            return Ok(new { url = "" });
        }

        [HttpPost]
        public async Task<ActionResult> AddCity(City city)
        {
            city.Id = 0;
            _context.Cities.Add(city);
            await _context.SaveChangesAsync();
            return CreatedAtAction(nameof(GetById), new { id = city.Id }, new { city.Id });
        }

        [HttpDelete("{id:int}")]
        public async Task<ActionResult> DeleteCity(int id)
        {
            var city = await _context.Cities.FirstOrDefaultAsync(c => c.Id == id);
            if (city == null) return NotFound();

            _context.Cities.Remove(city);
            await _context.SaveChangesAsync();

            return NoContent();
        }

        [HttpPut("{id:int}")]
        public async Task<ActionResult> UpdateCity(int id, City updatedCity)
        {
            var city = await _context.Cities.FirstOrDefaultAsync(c => c.Id == id);
            if (city == null) return NotFound();

            city.Name = updatedCity.Name;
            city.Description = updatedCity.Description;
            city.ImageUrl = updatedCity.ImageUrl;
            city.Rating = updatedCity.Rating;
            city.Population = updatedCity.Population;
            city.Tags = updatedCity.Tags;
            city.SearchQuery = updatedCity.SearchQuery;
            city.Region = updatedCity.Region;
            city.Latitude = updatedCity.Latitude;
            city.Longitude = updatedCity.Longitude;
            city.BestSeason = updatedCity.BestSeason;
            city.AverageTripDays = updatedCity.AverageTripDays;

            await _context.SaveChangesAsync();
            return NoContent();
        }

        private int? GetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : null;
        }

    }

    public class CityQuery
    {
        public string? Q { get; set; }
        public string? Region { get; set; }
        public string? Type { get; set; }
        public bool FavoritesOnly { get; set; }
    }

    public record CityFiltersDto(List<string> Regions, List<string> AttractionTypes);

    public class CityListDto
    {
        public int Id { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string ImageUrl { get; set; } = "";
        public double Rating { get; set; }
        public int Population { get; set; }
        public string Tags { get; set; } = "";
        public string SearchQuery { get; set; } = "";
        public string Region { get; set; } = "";
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public string BestSeason { get; set; } = "";
        public int AverageTripDays { get; set; }
        public bool IsFavorite { get; set; }
        public int ReviewsCount { get; set; }
        public int AttractionsCount { get; set; }
    }

    public class CityDetailDto : CityListDto
    {
        public List<AttractionDto> Attractions { get; set; } = new();
    }

    public class AttractionDto
    {
        public int Id { get; set; }
        public int CityId { get; set; }
        public string Name { get; set; } = "";
        public string Description { get; set; } = "";
        public string Type { get; set; } = "";
        public string Address { get; set; } = "";
        public string ImageUrl { get; set; } = "";
        public double? Latitude { get; set; }
        public double? Longitude { get; set; }
        public int AverageVisitMinutes { get; set; }
        public string PriceLevel { get; set; } = "";
        public bool IsFree { get; set; }
    }
}
