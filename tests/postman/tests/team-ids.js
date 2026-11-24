const { items } = pm.response.json();
const leadOf = (name) => items.find((v) => v.teamLead?.fullName === name);
pm.test('the demo Team Leads of both verticals are visible to Admin', () => {
  pm.expect(leadOf('Василь Мороз'), 'Василь Мороз').to.be.an('object');
  pm.expect(leadOf('Дмитро Савченко'), 'Дмитро Савченко').to.be.an('object');
});
pm.collectionVariables.set('team_vasyl_id', leadOf('Василь Мороз').teamLead.id);
pm.collectionVariables.set(
  'team_tl_crypto_id',
  leadOf('Дмитро Савченко').teamLead.id,
);
