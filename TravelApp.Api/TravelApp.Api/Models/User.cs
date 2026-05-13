namespace TravelApp.Api.Models
{
    public class User
    {
        public int Id { get; set; }
        public string Email { get; set; } = "";
        public string PasswordHash { get; set; } = "";
        public string Name { get; set; } = "";
        public string HomeCity { get; set; } = "";
        public string Bio { get; set; } = "";
        public string AvatarUrl { get; set; } = "";
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime? UpdatedAt { get; set; }

        // ── Role-based access control ──
        /// <summary>"User" (default) or "Admin". Admin-only endpoints check for "Admin".</summary>
        public string Role { get; set; } = "User";

        // User settings
        public string Theme { get; set; } = "dark";
        public bool AnimationsEnabled { get; set; } = true;

        // Password reset
        public string? ResetToken { get; set; }
        public DateTime? ResetTokenExpiry { get; set; }

        public List<Favorite> Favorites { get; set; } = new();
        public List<Review> Reviews { get; set; } = new();
        public List<TravelRoute> Routes { get; set; } = new();
        public List<LikedRoute> LikedRoutes { get; set; } = new();
    }
}
