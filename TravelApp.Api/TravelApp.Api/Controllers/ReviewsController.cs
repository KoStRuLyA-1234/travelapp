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
    public class ReviewsController : ControllerBase
    {
        private readonly AppDbContext _context;

        public ReviewsController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet("cities/{cityId:int}/reviews")]
        public async Task<ActionResult<List<ReviewDto>>> GetCityReviews(int cityId)
        {
            var cityExists = await _context.Cities.AnyAsync(c => c.Id == cityId);
            if (!cityExists) return NotFound(new { message = "Город не найден" });
            var currentUserId = TryGetUserId();

            return await _context.Reviews.AsNoTracking()
                .Where(r => r.CityId == cityId)
                .OrderByDescending(r => r.CreatedAt)
                .Select(r => new ReviewDto
                {
                    Id = r.Id,
                    CityId = r.CityId,
                    AttractionId = r.AttractionId,
                    Rating = r.Rating,
                    Text = r.Text,
                    CreatedAt = r.CreatedAt,
                    UserName = r.User!.Name,
                    IsOwn = currentUserId.HasValue && r.UserId == currentUserId.Value
                })
                .ToListAsync();
        }

        [Authorize]
        [HttpPost("cities/{cityId:int}/reviews")]
        public async Task<ActionResult<ReviewDto>> CreateReview(int cityId, [FromBody] CreateReviewRequest request)
        {
            if (request.Rating is < 1 or > 5)
                return BadRequest(new { message = "Оценка должна быть от 1 до 5" });

            if (string.IsNullOrWhiteSpace(request.Text) || request.Text.Trim().Length < 3)
                return BadRequest(new { message = "Отзыв должен содержать минимум 3 символа" });

            var city = await _context.Cities.FirstOrDefaultAsync(c => c.Id == cityId);
            if (city is null) return NotFound(new { message = "Город не найден" });

            if (request.AttractionId.HasValue)
            {
                var attractionMatchesCity = await _context.Attractions
                    .AnyAsync(a => a.Id == request.AttractionId.Value && a.CityId == cityId);
                if (!attractionMatchesCity)
                    return BadRequest(new { message = "Достопримечательность не относится к выбранному городу" });
            }

            var userId = GetUserId();
            var review = new Review
            {
                UserId = userId,
                CityId = cityId,
                AttractionId = request.AttractionId,
                Rating = request.Rating,
                Text = request.Text.Trim(),
                CreatedAt = DateTime.UtcNow
            };

            _context.Reviews.Add(review);
            await _context.SaveChangesAsync();
            await RefreshCityRating(cityId);

            var userName = await _context.Users
                .Where(u => u.Id == userId)
                .Select(u => u.Name)
                .FirstAsync();

            return Ok(new ReviewDto
            {
                Id = review.Id,
                CityId = review.CityId,
                AttractionId = review.AttractionId,
                Rating = review.Rating,
                Text = review.Text,
                CreatedAt = review.CreatedAt,
                UserName = userName,
                IsOwn = true
            });
        }

        [Authorize]
        [HttpDelete("reviews/{id:int}")]
        public async Task<ActionResult> DeleteReview(int id)
        {
            var userId = GetUserId();
            var review = await _context.Reviews.FirstOrDefaultAsync(r => r.Id == id);
            if (review is null) return NotFound();
            if (review.UserId != userId) return Forbid();

            var cityId = review.CityId;
            _context.Reviews.Remove(review);
            await _context.SaveChangesAsync();
            await RefreshCityRating(cityId);

            return NoContent();
        }

        private async Task RefreshCityRating(int cityId)
        {
            var city = await _context.Cities.FirstAsync(c => c.Id == cityId);
            var ratings = await _context.Reviews
                .Where(r => r.CityId == cityId)
                .Select(r => r.Rating)
                .ToListAsync();

            if (ratings.Count > 0)
                city.Rating = Math.Round(ratings.Average(), 1);

            await _context.SaveChangesAsync();
        }

        private int GetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : throw new InvalidOperationException("User id claim is missing.");
        }

        private int? TryGetUserId()
        {
            var value = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(value, out var id) ? id : null;
        }
    }

    public class CreateReviewRequest
    {
        public int Rating { get; set; }
        public string Text { get; set; } = "";
        public int? AttractionId { get; set; }
    }

    public class ReviewDto
    {
        public int Id { get; set; }
        public int CityId { get; set; }
        public int? AttractionId { get; set; }
        public int Rating { get; set; }
        public string Text { get; set; } = "";
        public DateTime CreatedAt { get; set; }
        public string UserName { get; set; } = "";
        public bool IsOwn { get; set; }
    }
}
