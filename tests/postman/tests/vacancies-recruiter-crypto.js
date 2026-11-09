const { items } = pm.response.json();
pm.test('only Крипто vacancies, never a Гемблінг one', () => {
  pm.expect(items.length).to.be.above(0);
  items.forEach((v) => pm.expect(v.vertical.name).to.equal('Крипто'));
  pm.expect(items.map((v) => v.id)).to.not.include(
    pm.collectionVariables.get('vacancy_gambling_id'),
  );
});
pm.collectionVariables.set('vacancy_crypto_vertical_id', items[0].vertical.id);
pm.collectionVariables.set(
  'vacancy_crypto_position_id',
  items.find((v) => v.position).position.id,
);
