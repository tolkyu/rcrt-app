const { items } = pm.response.json();
const byName = Object.fromEntries(items.map((p) => [p.name, p]));
pm.test('seeded positions of both verticals are in the catalog', () => {
  pm.expect(byName).to.include.all.keys(
    'Медіабаєр — Facebook',
    'Крипто-трейдер',
  );
  pm.expect(byName['Медіабаєр — Facebook'].verticalId).to.not.equal(
    byName['Крипто-трейдер'].verticalId,
  );
});
pm.collectionVariables.set('position_run', Date.now().toString(36));
pm.collectionVariables.set(
  'position_gambling_vertical_id',
  byName['Медіабаєр — Facebook'].verticalId,
);
pm.collectionVariables.set(
  'position_crypto_vertical_id',
  byName['Крипто-трейдер'].verticalId,
);
