namespace TravelApp.Api.Models;

public class Favorite
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int CityId { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public User? User { get; set; }
    public City? City { get; set; }
}
