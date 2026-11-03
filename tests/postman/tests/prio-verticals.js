const { items } = pm.response.json();
const byName = Object.fromEntries(items.map((v) => [v.name, v.id]));
pm.test('both demo verticals are tabs', () => {
  pm.expect(byName).to.include.all.keys('Гемблінг', 'Крипто');
});
pm.collectionVariables.set('prio_gambling_id', byName['Гемблінг']);
pm.collectionVariables.set('prio_crypto_id', byName['Крипто']);
