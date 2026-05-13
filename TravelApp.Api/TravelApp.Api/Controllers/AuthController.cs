using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using System.ComponentModel.DataAnnotations;
using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
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
        private readonly ILogger<AuthController> _logger;

        public AuthController(
            AppDbContext context,
            IConfiguration config,
            ILogger<AuthController> logger)
        {
            _context = context;
            _config = config;
            _logger = logger;
        }

        [HttpPost("register")]
        public async Task<ActionResult<AuthResponse>> Register([FromBody] AuthRequest request)
        {
            try
            {
                var validation = ValidateCredentials(request, requireProfile: true);
                if (validation is not null) return validation;

                var email = NormalizeEmail(request.Email);
                if (await _context.Users.AnyAsync(u => u.Email == email))
                {
                    _logger.LogInformation("Register rejected — email {Email} already in use.", email);
                    return BadRequest(new { message = "Email уже используется" });
                }

                var user = new User
                {
                    Email             = email,
                    PasswordHash      = BCrypt.Net.BCrypt.HashPassword(request.Password),
                    Name              = string.IsNullOrWhiteSpace(request.Name) ? "Путешественник" : request.Name.Trim(),
                    HomeCity          = request.HomeCity?.Trim() ?? "",
                    Bio               = "",
                    AvatarUrl         = "",
                    Theme             = "dark",
                    AnimationsEnabled = true,
                    CreatedAt         = DateTime.UtcNow
                };

                _context.Users.Add(user);
                await _context.SaveChangesAsync();
                _logger.LogInformation("Register OK — created user {Email} (id {Id}).", email, user.Id);
                return Ok(BuildAuthResponse(user));
            }
            catch (DbUpdateException ex)
            {
                // Most likely a race-condition unique-violation on Email — translate to 409.
                _logger.LogWarning(ex, "Register failed with DbUpdateException for {Email}", request?.Email);
                return Conflict(new { message = "Email уже используется (или база недоступна). Попробуй другой адрес." });
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Unhandled error in /api/auth/register for {Email}", request?.Email);
                return StatusCode(500, new { message = "Не удалось зарегистрироваться. Подробности в логах сервера." });
            }
        }

        [HttpPost("login")]
        public async Task<ActionResult<AuthResponse>> Login([FromBody] AuthRequest request)
        {
            try
            {
                var validation = ValidateCredentials(request, requireProfile: false);
                if (validation is not null) return validation;

                var email = NormalizeEmail(request.Email);
                var user  = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);

                if (user == null)
                {
                    _logger.LogInformation("Login rejected — no user with email {Email}.", email);
                    return BadRequest(new { message = "Неверный email или пароль" });
                }

                bool passwordOk;
                try
                {
                    passwordOk = BCrypt.Net.BCrypt.Verify(request.Password, user.PasswordHash);
                }
                catch (BCrypt.Net.SaltParseException ex)
                {
                    // Stored hash isn't a BCrypt hash (data corruption / bad seed) → log + reject cleanly.
                    _logger.LogError(ex, "Login: stored PasswordHash for {Email} is not a valid BCrypt hash.", email);
                    return StatusCode(500, new { message = "Учётная запись повреждена. Сбрось пароль или удали пользователя." });
                }

                if (!passwordOk)
                {
                    _logger.LogInformation("Login rejected — wrong password for {Email}.", email);
                    return BadRequest(new { message = "Неверный email или пароль" });
                }

                _logger.LogInformation("Login OK — {Email} (id {Id}).", email, user.Id);
                return Ok(BuildAuthResponse(user));
            }
            catch (Exception ex)
            {
                // Almost always: Postgres is down, wrong connection string, or migration not applied.
                _logger.LogError(ex, "Unhandled error in /api/auth/login for {Email}", request?.Email);
                return StatusCode(500, new { message = "Не удалось выполнить вход. База недоступна или сервер упал." });
            }
        }

        [Authorize]
        [HttpGet("me")]
        public async Task<ActionResult<AuthResponse>> Me()
        {
            var user = await GetCurrentUser();
            return user is null ? Unauthorized() : Ok(BuildAuthResponse(user));
        }

        [Authorize]
        [HttpPut("me")]
        public async Task<ActionResult<AuthResponse>> UpdateMe([FromBody] UpdateProfileRequest request)
        {
            var user = await GetCurrentUser();
            if (user is null) return Unauthorized();

            if (!string.IsNullOrWhiteSpace(request.Name))
                user.Name = request.Name.Trim();

            user.HomeCity = request.HomeCity?.Trim() ?? user.HomeCity;
            user.Bio = request.Bio?.Trim() ?? user.Bio;
            user.AvatarUrl = request.AvatarUrl?.Trim() ?? user.AvatarUrl;

            if (request.Theme is "light" or "dark")
                user.Theme = request.Theme;

            if (request.AnimationsEnabled.HasValue)
                user.AnimationsEnabled = request.AnimationsEnabled.Value;

            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();
            return Ok(BuildAuthResponse(user));
        }

        [HttpPost("forgot-password")]
        public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Email))
                return BadRequest(new { message = "Укажите email" });

            var email = NormalizeEmail(request.Email);
            var user = await _context.Users.FirstOrDefaultAsync(u => u.Email == email);

            // Always return the same public message to avoid email enumeration.
            const string message = "Если email зарегистрирован, вы получите письмо для восстановления пароля";
            if (user is null) return Ok(new { message });

            user.ResetToken = GenerateResetToken();
            user.ResetTokenExpiry = DateTime.UtcNow.AddHours(1);
            await _context.SaveChangesAsync();

            var isDev = string.Equals(_config["ASPNETCORE_ENVIRONMENT"], "Development", StringComparison.OrdinalIgnoreCase);
            return Ok(isDev ? new { message, debug_token = user.ResetToken } : new { message });
        }

        [HttpPost("reset-password")]
        public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest request)
        {
            if (string.IsNullOrWhiteSpace(request.Token) || string.IsNullOrWhiteSpace(request.NewPassword))
                return BadRequest(new { message = "Токен и новый пароль обязательны" });

            if (request.NewPassword.Length < 6)
                return BadRequest(new { message = "Пароль должен быть не короче 6 символов" });

            var user = await _context.Users.FirstOrDefaultAsync(u =>
                u.ResetToken == request.Token && u.ResetTokenExpiry > DateTime.UtcNow);

            if (user is null)
                return BadRequest(new { message = "Недействительный или истёкший токен" });

            user.PasswordHash = BCrypt.Net.BCrypt.HashPassword(request.NewPassword);
            user.ResetToken = null;
            user.ResetTokenExpiry = null;
            user.UpdatedAt = DateTime.UtcNow;
            await _context.SaveChangesAsync();

            return Ok(new { message = "Пароль успешно изменён" });
        }

        // Supabase integration removed — local auth only (BCrypt + JWT).
        // Stub kept so older clients that still call /supabase-exchange get
        // a clean 410 Gone, not a 404. Safe to delete after frontend deploy.
        [HttpPost("supabase-exchange")]
        public IActionResult SupabaseExchangeRemoved() =>
            StatusCode(410, new { message = "Supabase больше не используется. Войди через email и пароль." });

        [Authorize]
        [HttpGet("liked-routes")]
        public async Task<ActionResult<List<int>>> GetLikedRoutes()
        {
            var user = await GetCurrentUser();
            if (user is null) return Unauthorized();

            var ids = await _context.LikedRoutes
                .Where(l => l.UserId == user.Id)
                .Select(l => l.TravelRouteId)
                .ToListAsync();

            return Ok(ids);
        }

        [Authorize]
        [HttpPost("liked-routes/{routeId:int}")]
        public async Task<IActionResult> LikeRoute(int routeId)
        {
            var user = await GetCurrentUser();
            if (user is null) return Unauthorized();

            if (!await _context.TravelRoutes.AnyAsync(r => r.Id == routeId))
                return NotFound(new { message = "Маршрут не найден" });

            var exists = await _context.LikedRoutes.AnyAsync(l => l.UserId == user.Id && l.TravelRouteId == routeId);
            if (!exists)
            {
                _context.LikedRoutes.Add(new LikedRoute { UserId = user.Id, TravelRouteId = routeId });
                await _context.SaveChangesAsync();
            }

            return Ok();
        }

        [Authorize]
        [HttpDelete("liked-routes/{routeId:int}")]
        public async Task<IActionResult> UnlikeRoute(int routeId)
        {
            var user = await GetCurrentUser();
            if (user is null) return Unauthorized();

            var like = await _context.LikedRoutes
                .FirstOrDefaultAsync(l => l.UserId == user.Id && l.TravelRouteId == routeId);

            if (like is not null)
            {
                _context.LikedRoutes.Remove(like);
                await _context.SaveChangesAsync();
            }

            return Ok();
        }

        private ActionResult? ValidateCredentials(AuthRequest? request, bool requireProfile)
        {
            // Frontend may post `{"email": null}` (or no body at all) → defend against NRE.
            if (request is null || string.IsNullOrWhiteSpace(request.Email))
                return BadRequest(new { message = "Введите корректный email" });

            var email = NormalizeEmail(request.Email);
            if (!new EmailAddressAttribute().IsValid(email))
                return BadRequest(new { message = "Введите корректный email" });

            if (string.IsNullOrWhiteSpace(request.Password) || request.Password.Length < 6)
                return BadRequest(new { message = "Пароль должен быть не короче 6 символов" });

            if (requireProfile && string.IsNullOrWhiteSpace(request.Name))
                return BadRequest(new { message = "Укажите имя" });

            return null;
        }

        private async Task<User?> GetCurrentUser()
        {
            var userId = User.FindFirstValue(ClaimTypes.NameIdentifier);
            return int.TryParse(userId, out var id)
                ? await _context.Users.FirstOrDefaultAsync(u => u.Id == id)
                : null;
        }

        private AuthResponse BuildAuthResponse(User user) => new()
        {
            Id = user.Id,
            Token = GenerateToken(user),
            Name = user.Name,
            HomeCity = user.HomeCity,
            Email = user.Email,
            Bio = user.Bio,
            AvatarUrl = user.AvatarUrl,
            Theme = user.Theme,
            AnimationsEnabled = user.AnimationsEnabled,
            Role              = string.IsNullOrWhiteSpace(user.Role) ? "User" : user.Role
        };

        private string GenerateToken(User user)
        {
            var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_config["Jwt:Key"]!));
            var creds = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);
            // Always emit a Role claim — defaults to "User" so [Authorize(Roles="…")]
            // works even on legacy users that pre-date the Role column.
            var role = string.IsNullOrWhiteSpace(user.Role) ? "User" : user.Role;
            var claims = new[]
            {
                new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
                new Claim(ClaimTypes.Email, user.Email),
                new Claim(ClaimTypes.Name,  user.Name),
                new Claim(ClaimTypes.Role,  role)
            };

            var token = new JwtSecurityToken(
                claims: claims,
                expires: DateTime.UtcNow.AddDays(30),
                signingCredentials: creds
            );

            return new JwtSecurityTokenHandler().WriteToken(token);
        }

        private static string NormalizeEmail(string email) => email.Trim().ToLowerInvariant();

        private static string GenerateResetToken() =>
            Convert.ToBase64String(RandomNumberGenerator.GetBytes(32))
                .Replace("+", "-")
                .Replace("/", "_")
                .TrimEnd('=');
    }

    public class AuthRequest
    {
        public string Email { get; set; } = "";
        public string Password { get; set; } = "";
        public string? Name { get; set; }
        public string? HomeCity { get; set; }
    }

    public class UpdateProfileRequest
    {
        public string? Name { get; set; }
        public string? HomeCity { get; set; }
        public string? Bio { get; set; }
        public string? AvatarUrl { get; set; }
        public string? Theme { get; set; }
        public bool? AnimationsEnabled { get; set; }
    }

    public class ForgotPasswordRequest
    {
        public string Email { get; set; } = "";
    }

    public class ResetPasswordRequest
    {
        public string Token { get; set; } = "";
        public string NewPassword { get; set; } = "";
    }

    public class AuthResponse
    {
        public int Id { get; set; }
        public string Token { get; set; } = "";
        public string Name { get; set; } = "";
        public string HomeCity { get; set; } = "";
        public string Email { get; set; } = "";
        public string Bio { get; set; } = "";
        public string AvatarUrl { get; set; } = "";
        public string Theme { get; set; } = "dark";
        public bool AnimationsEnabled { get; set; } = true;
        public string Role { get; set; } = "User";
    }
}
