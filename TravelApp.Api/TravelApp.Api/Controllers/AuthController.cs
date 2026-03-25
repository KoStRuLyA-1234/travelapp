using Microsoft.AspNetCore.Mvc;
using Microsoft.IdentityModel.Tokens;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Text;
using TravelApp.Api.Data;
using TravelApp.Api.Models;

namespace TravelApp.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    public class AuthController : ControllerBase
    {
        private readonly AppDbContext _context;
        private readonly IConfiguration _config;

        public AuthController(AppDbContext context, IConfiguration config)
        {
            _context = context;
            _config = config;
        }

        [HttpPost("register")]
        public ActionResult Register([FromBody] AuthRequest request)
        {
            if (_context.Users.Any(u => u.Email == request.Email))
                return BadRequest(new { message = "Email уже используется" });

            var user = new User
            {
                Email = request.Email,
                PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.Password),
                Name = request.Name ?? "Путешественник",
                HomeCity = request.HomeCity ?? ""
            };

            _context.Users.Add(user);
            _context.SaveChanges();

            var token = GenerateToken(user);
            return Ok(new AuthResponse
            {
                Token = token,
                Name = user.Name,
                HomeCity = user.HomeCity,
                Email = user.Email
            });
        }

        [HttpPost("login")]
        public ActionResult Login([FromBody] AuthRequest request)
        {
            var user = _context.Users.FirstOrDefault(u => u.Email == request.Email);

            if (user == null || !BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash))
                return BadRequest(new { message = "Неверный email или пароль" });

            var token = GenerateToken(user);
            return Ok(new AuthResponse
            {
                Token = token,
                Name = user.Name,
                HomeCity = user.HomeCity,
                Email = user.Email
            });
        }

        private string GenerateToken(User user)
        {
            var key = new SymmetricSecurityKey(
                Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name, user.Name)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }
    }

    public class AuthRequest
    {
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
        public string? Name { get; set; }
        public string? HomeCity { get; set; }
    }

    public class AuthResponse
    {
        public string Token { get; set; } = "";
        public string Name { get; set; } = "";
        public string HomeCity { get; set; } = "";
        public string Email { get; set; } = "";
    }
}