const page = pm.response.json();
pm.test('only Гемблінг rows, nothing newer than the first page', () => {
  pm.expect(page.items.length).to.be.above(0);
  page.items.forEach((v) => pm.expect(v.vertical.name).to.equal('Гемблінг'));
  pm.expect(page.prevCursor).to.equal(null);
});
pm.test('newest first by public number', () => {
  const numbers = page.items.map((v) => Number(v.number.slice(2)));
  pm.expect(numbers).to.deep.equal([...numbers].sort((a, b) => b - a));
  pm.expect(page.items[0].number).to.match(/^V-\d{4,}$/);
});
pm.collectionVariables.set('vacancy_gambling_id', page.items[0].id);
pm.collectionVariables.set(
  'vacancy_gambling_vertical_id',
  page.items[0].vertical.id,
);
pm.collectionVariables.set(
  'vacancy_gambling_position_id',
  page.items.find((v) => v.position).position.id,
);
pm.collectionVariables.set('vacancy_run', Date.now().toString(36));
