namespace TravelApp.Api.Models;

public class Attraction
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
    public int AverageVisitMinutes { get; set; } = 90;
    public string PriceLevel { get; set; } = "medium";
    public bool IsFree { get; set; }
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;

    public City? City { get; set; }
    public List<RouteStop> RouteStops { get; set; } = new();
    public List<Review> Reviews { get; set; } = new();
}
