const { items } = pm.response.json();
const byName = Object.fromEntries(items.map((p) => [p.name, p]));
pm.test('manager list: every row has a non-negative open-vacancy count', () => {
  items.forEach((p) =>
    pm.expect(p.openVacanciesCount).to.be.a('number').and.at.least(0),
  );
});
pm.test('seeded positions of both verticals are in the catalog', () => {
  pm.expect(byName).to.include.all.keys(
    'Медіабаєр — Facebook',
    'Крипто-трейдер',
  );
  pm.expect(byName['Медіабаєр — Facebook'].verticalId).to.not.equal(
    byName['Крипто-трейдер'].verticalId,
  );
});
