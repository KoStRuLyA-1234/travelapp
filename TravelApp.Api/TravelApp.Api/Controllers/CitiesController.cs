using Microsoft.AspNetCore.Mvc;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class CitiesController : ControllerBase
    {
        private readonly AppDbContext _context;

        public CitiesController(AppDbContext context)
        {
            _context = context;
        }

        [HttpGet]
        public ActionResult<List<City>> Get()
        {
            return _context.Cities.ToList();
        }

        [HttpGet("{id}")]
        public ActionResult<City> GetById(int id)
        {
            var city = _context.Cities.FirstOrDefault(c => c.Id == id);
            if (city == null)
            {
                return NotFound();
            }
            return city;
        }

        [HttpGet("{id}/photo")]
        public async Task<ActionResult<string>> GetCityPhoto(int id)
        {
            var city = _context.Cities.FirstOrDefault(c => c.Id == id);
            if (city == null) return NotFound();

            if (!string.IsNullOrEmpty(city.ImageUrl) && city.ImageUrl.StartsWith("http"))
                return Ok(new { url = city.ImageUrl });

            using var http = new HttpClient();
            http.DefaultRequestHeaders.Add("User-Agent", "TravelApp/1.0");

            var url = $"https://ru.wikipedia.org/api/rest_v1/page/summary/{Uri.EscapeDataString(city.Name)}";
            var response = await http.GetStringAsync(url);
            var json = System.Text.Json.JsonDocument.Parse(response);

            if (json.RootElement.TryGetProperty("thumbnail", out var thumb) &&
                thumb.TryGetProperty("source", out var source))
            {
                var photoUrl = source.GetString() ?? "";
                city.ImageUrl = photoUrl;
                _context.SaveChanges();
                return Ok(new { url = photoUrl });
            }

            return Ok(new { url = "" });
        }

        [HttpPost]
        public ActionResult AddCity(City city)
        {
            city.Id = 0;
            _context.Cities.Add(city);
            _context.SaveChanges();
            return Ok();
        }

        [HttpDelete("{id}")]
        public ActionResult DeleteCity(int id)
        {
            var city = _context.Cities.FirstOrDefault(c => c.Id == id);

            if (city == null)
            {
                return NotFound();
            }

            _context.Cities.Remove(city);
            _context.SaveChanges();

            return Ok();
        }

        [HttpPut("{id}")]
        public ActionResult UpdateCity(int id, City updatedCity)
        {
            var city = _context.Cities.FirstOrDefault(c => c.Id == id);

            if (city == null)
            {
                return NotFound();
            }

            city.Name = updatedCity.Name;
            city.Description = updatedCity.Description;
            city.ImageUrl = updatedCity.ImageUrl;
            city.Rating = updatedCity.Rating;
            city.Population = updatedCity.Population;

            _context.SaveChanges();

            return Ok();
        }
    }
}