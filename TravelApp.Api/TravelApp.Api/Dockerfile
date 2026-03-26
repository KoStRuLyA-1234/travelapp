FROM ubuntu:24.04 AS build
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /src

RUN apt-get update && \
    apt-get install -y dotnet-sdk-8.0 ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY ["TravelApp.Api.csproj", "./"]
RUN dotnet restore

COPY . .
RUN dotnet publish -c Release -o /app/publish

FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
WORKDIR /app

RUN apt-get update && \
    apt-get install -y aspnetcore-runtime-8.0 ca-certificates && \
    update-ca-certificates && \
    rm -rf /var/lib/apt/lists/*

COPY --from=build /app/publish .

ENV ASPNETCORE_URLS=http://+:8080
EXPOSE 8080

ENTRYPOINT ["dotnet", "TravelApp.Api.dll"]