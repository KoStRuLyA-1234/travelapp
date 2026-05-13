namespace TravelApp.Api.Models;

public class Review
{
    public int Id { get; set; }
    public int UserId { get; set; }
    public int CityId { get; set; }
    public int? AttractionId { get; set; }
    public int Rating { get; set; }
    public string Text { get; set; } = "";
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime? UpdatedAt { get; set; }

    public User? User { get; set; }
    public City? City { get; set; }
    public Attraction? Attraction { get; set; }
}
