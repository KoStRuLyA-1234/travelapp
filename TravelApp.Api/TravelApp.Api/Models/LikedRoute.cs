namespace TravelApp.Api.Models
{
    public class LikedRoute
    {
        public int Id { get; set; }
        public int UserId { get; set; }
        public User User { get; set; } = null!;
        public int TravelRouteId { get; set; }
        public TravelRoute TravelRoute { get; set; } = null!;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
