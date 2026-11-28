using System.Threading.Channels;

namespace RestaurantSystem.Api.Services;

public sealed class SmsQueue
{
    private readonly Channel<Guid> _channel = Channel.CreateBounded<Guid>(new BoundedChannelOptions(500)
    {
        FullMode = BoundedChannelFullMode.DropOldest,
        SingleReader = true,
        SingleWriter = false
    });

    public bool TryEnqueue(Guid smsLogId) => _channel.Writer.TryWrite(smsLogId);

    public IAsyncEnumerable<Guid> ReadAllAsync(CancellationToken ct) => _channel.Reader.ReadAllAsync(ct);
}

public sealed class SmsBackgroundWorker(
    SmsQueue queue,
    IServiceScopeFactory scopes,
    ILogger<SmsBackgroundWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await foreach (var smsLogId in queue.ReadAllAsync(stoppingToken))
        {
            const int maxAttempts = 3;
            for (var attempt = 1; attempt <= maxAttempts; attempt++)
            {
                if (stoppingToken.IsCancellationRequested) break;
                try
                {
                    using var scope = scopes.CreateScope();
                    var smsService = scope.ServiceProvider.GetRequiredService<TextBeeSmsService>();
                    var (done, retryable) = await smsService.DispatchQueuedSmsAsync(smsLogId, attempt, stoppingToken);
                    if (done || !retryable) break;
                }
                catch (Exception ex)
                {
                    logger.LogWarning(ex, "SMS background worker attempt {Attempt} failed for SmsLogId {SmsLogId}", attempt, smsLogId);
                }

                if (attempt < maxAttempts)
                {
                    await Task.Delay(TimeSpan.FromSeconds(attempt == 1 ? 1 : 3), stoppingToken);
                }
            }
        }
    }
}
