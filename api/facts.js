// Pisma se poslužuju odavde: izvorna iz datoteke, a ako ih je admin uređivao, iz baze.
const { getFacts } = require('./_lib');

module.exports = async (req, res) => {
  const { facts } = await getFacts();
  res.setHeader('Cache-Control', 'public, s-maxage=30, stale-while-revalidate=300');
  res.status(200).json(facts);
};
