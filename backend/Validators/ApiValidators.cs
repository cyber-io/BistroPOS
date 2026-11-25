using FluentValidation;
using RestaurantSystem.Api.DTOs;

namespace RestaurantSystem.Api.Validators;

public class RegisterRequestValidator : AbstractValidator<RegisterRequest>
{
    public RegisterRequestValidator()
    {
        RuleFor(x => x.Name).NotEmpty().MaximumLength(100);
        RuleFor(x => x.Email).NotEmpty().EmailAddress().MaximumLength(150);
        RuleFor(x => x.Password)
            .NotEmpty()
            .MinimumLength(8).WithMessage("Password must be at least 8 characters long.")
            .Matches("[A-Za-z]").WithMessage("Password must contain at least one letter.")
            .Matches("[0-9]").WithMessage("Password must contain at least one number.");
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

public class CalculateSplitRequestValidator : AbstractValidator<CalculateSplitRequest>
{
    public CalculateSplitRequestValidator()
    {
        RuleFor(x => x.RestaurantId).NotEmpty();
        RuleFor(x => x.SplitCount).InclusiveBetween(1, 50).WithMessage("Split count must be between 1 and 50.");
        RuleFor(x => x.TipAmount).GreaterThanOrEqualTo(0).WithMessage("Tip amount cannot be negative.");
        RuleFor(x => x.TipPercent).InclusiveBetween(0, 100).WithMessage("Tip percentage must be between 0 and 100.");
        RuleFor(x => x.LoyaltyDiscount).GreaterThanOrEqualTo(0).WithMessage("Loyalty discount cannot be negative.");
        RuleForEach(x => x.ItemShares).ChildRules(share =>
        {
            share.RuleFor(s => s.OrderItemId).NotEmpty();
            share.RuleFor(s => s.DinerIndex).GreaterThanOrEqualTo(0);
            share.RuleFor(s => s.Quantity).InclusiveBetween(1, 100);
        });
    }
}
