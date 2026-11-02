import { test, assertEqual } from './harness.js';
import { formatINR, formatINRPerMonth } from '../ui/format.js';

test('formatINR: below a lakh uses Indian grouping', () => {
  assertEqual(formatINR(0), '₹0');
  assertEqual(formatINR(999), '₹999');
  assertEqual(formatINR(50000), '₹50,000');
  assertEqual(formatINR(99999), '₹99,999');
});

test('formatINR: lakh units', () => {
  assertEqual(formatINR(100000), '₹1 lakh');
  assertEqual(formatINR(800000), '₹8 lakh');
  assertEqual(formatINR(150000), '₹1.5 lakh');
  assertEqual(formatINR(9950000), '₹99.5 lakh');
});

test('formatINR: crore units', () => {
  assertEqual(formatINR(10000000), '₹1 crore');
  assertEqual(formatINR(12000000), '₹1.2 crore');
  assertEqual(formatINR(123456789), '₹12.35 crore');
});

test('formatINR: negatives keep the sign in front', () => {
  assertEqual(formatINR(-400000), '-₹4 lakh');
  assertEqual(formatINR(-2500), '-₹2,500');
});

test('formatINRPerMonth appends the unit', () => {
  assertEqual(formatINRPerMonth(15000), '₹15,000/month');
});
