import { formatINR } from './format.js';

// The facts a player needs to weigh renting against buying, in today's rupees.
// `offer` comes from homeOffer(); `priceIndex` is the state's, to turn nominal rupees into today's.
export function describeOffer(offer, priceIndex) {
  const k = 1 / priceIndex;
  const rent = `Rent now: ${formatINR(offer.rentPerMonth * k)} a month, rising with prices.`;
  const buy = [
    `Home price ${formatINR(offer.price * k)}. You pay ${formatINR(offer.needed * k)} now for the down payment and buying costs.`,
    `Then about ${formatINR(offer.paymentPerMonth * k)} a month for ${offer.years} years, plus upkeep of about ${formatINR(offer.upkeepPerYear * k)} a year.`,
  ];
  if (!offer.affordable && !offer.owns) {
    buy.push(`Not yet: you are ${formatINR(offer.shortfall * k)} short in cash and savings.`);
  }
  return { rent, buy };
}
