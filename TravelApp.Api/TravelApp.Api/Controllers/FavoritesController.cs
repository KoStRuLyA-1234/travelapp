using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using System.Security.Claims;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [Authorize]
    [ApiController]
    [Route("api/[controller]")]
    public class FavoritesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public FavoritesController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("ids")]
        public async Task<ActionResult<List<int>>> GetFavoriteIds()
        {
            var userId = GetUserId();
            return await _context.Favorites.AsNoTracking()
                .Where(f => f.UserId == userId)
                .OrderByDescending(f => f.CreatedAt)
                .Select(f => f.CityId)
                .ToListAsync();
        }

        [HttpGet]
        public async Task<ActionResult<List<CityListDto>>> GetFavorites()
        {
            var userId = GetUserId();

            return await _context.Favorites.AsNoTracking()
                .Where(f => f.UserId == userId)
                .OrderByDescending(f => f.CreatedAt)
                .Select(f => new CityListDto
                {
                    Id = f.City!.Id,
                    Name = f.City.Name,
                    Description = f.City.Description,
                    ImageUrl = f.City.ImageUrl,
                    Rating = f.City.Reviews.Any() ? Math.Round(f.City.Reviews.Average(r => r.Rating), 1) : f.City.Rating,
                    Population = f.City.Population,
                    Tags = f.City.Tags,
                    SearchQuery = f.City.SearchQuery,
                    Region = f.City.Region,
                    Latitude = f.City.Latitude,
                    Longitude = f.City.Longitude,
                    BestSeason = f.City.BestSeason,
                    AverageTripDays = f.City.AverageTripDays,
                    IsFavorite = true,
                    ReviewsCount = f.City.Reviews.Count,
                    AttractionsCount = f.City.Attractions.Count
                })
                .ToListAsync();
        }

        [HttpPost("{cityId:int}")]
        public async Task<ActionResult> AddFavorite(int cityId)
        {
            var userId = GetUserId();
            var exists = await _context.Cities.AnyAsync(c => c.Id == cityId);
            if (!exists) return NotFound(new { message = "Город не найден" });

            var alreadySaved = await _context.Favorites.AnyAsync(f => f.UserId == userId && f.CityId == cityId);
            if (!alreadySaved)
            {
                _context.Favorites.Add(new Favorite { UserId = userId, CityId = cityId, CreatedAt = DateTime.UtcNow });
                await _context.SaveChangesAsync();
            }

            return Ok(new { saved = true });
        }

        [HttpDelete("{cityId:int}")]
        public async Task<ActionResult> RemoveFavorite(int cityId)
        {
            var userId = GetUserId();
            var favorite = await _context.Favorites.FirstOrDefaultAsync(f => f.UserId == userId && f.CityId == cityId);
            if (favorite is null) return NoContent();

            _context.Favorites.Remove(favorite);
            await _context.SaveChangesAsync();
            return NoContent();
        }

        private int GetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : throw new InvalidOperationException("User id claim is missing.");
        }
    }
}
