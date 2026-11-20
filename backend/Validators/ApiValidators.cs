using FluentValidation;
using RestaurantSystem.Api.DTOs;

namespace RestaurantSystem.Api.Validators;

public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(150);
        RuleFor(x => x.Password).NotEmpty().MinimumLength(6);
    }
}

public class CreateOrderRequestValidator : AbstractValidator<CreateOrderRequest>
{
    public CreateOrderRequestValidator()
    {
        RuleFor(x => x.RestaurantId).NotEmpty();
        RuleFor(x => x.Source).NotEmpty().Must(s => s is "DINE_IN_QR" or "DELIVERY" or "TAKEAWAY");
        RuleFor(x => x.Items).NotEmpty().WithMessage("Order must contain at least one item.");
        RuleFor(x => x.Items).Must(items => items == null || items.Count <= 100).WithMessage("An order can contain at most 100 lines.");
        RuleFor(x => x.SpecialInstructions).MaximumLength(2000);
        RuleFor(x => x.IdempotencyKey).MaximumLength(100);
        RuleForEach(x => x.Items).ChildRules(items =>
        {
            items.RuleFor(i => i.MenuItemId).NotEmpty();
            items.RuleFor(i => i.Quantity).GreaterThan(0).LessThanOrEqualTo(50);
        });
    }
}

public class CreateReservationRequestValidator : AbstractValidator<CreateReservationRequest>
{
    public CreateReservationRequestValidator()
    {
        RuleFor(x => x.RestaurantId).NotEmpty();
        RuleFor(x => x.CustomerName).NotEmpty().MaximumLength(100);
        RuleFor(x => x.CustomerPhone).NotEmpty().Matches(@"^\+?[0-9\s\-]{8,20}$").WithMessage("Invalid phone number format.");
        RuleFor(x => x.CustomerEmail).NotEmpty().EmailAddress();
        RuleFor(x => x.GuestCount).InclusiveBetween(1, 70);
        RuleFor(x => x.SpecialRequest).MaximumLength(1000);
    }
}

public class InitiatePaymentRequestValidator : AbstractValidator<InitiatePaymentRequest>
{
    public InitiatePaymentRequestValidator()
    {
        RuleFor(x => x.RestaurantId).NotEmpty();
        RuleFor(x => x.Amount).GreaterThan(0);
        RuleFor(x => x.Method).NotEmpty().Must(m => m is "CASH" or "UPI" or "CARD" or "ONLINE" or "NET_BANKING" or "WALLET");
    }
}
