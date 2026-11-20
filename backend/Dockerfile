# Build Stage
FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src

# Copy project file and restore dependencies
COPY ["RestaurantSystem.Api.csproj", "./"]
RUN dotnet restore "RestaurantSystem.Api.csproj"

# Copy full source and build
COPY . .
RUN dotnet build "RestaurantSystem.Api.csproj" -c Release -o /app/build

# Publish
FROM build AS publish
RUN dotnet publish "RestaurantSystem.Api.csproj" -c Release -o /app/publish /p:UseAppHost=false

# Runtime Stage
FROM mcr.microsoft.com/dotnet/aspnet:8.0 AS final
WORKDIR /app
EXPOSE 5000
ENV ASPNETCORE_URLS=http://+:5000
ENV ASPNETCORE_ENVIRONMENT=Development

COPY --from=publish /app/publish .
ENTRYPOINT ["dotnet", "RestaurantSystem.Api.dll"]
