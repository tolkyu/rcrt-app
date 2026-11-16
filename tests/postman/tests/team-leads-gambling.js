const { items } = pm.response.json();
pm.test('Гемблінг Team Leads by priority: Василь 0, Тарас 1', () => {
  pm.expect(
    items.slice(0, 2).map((i) => [i.fullName, i.priority]),
  ).to.deep.equal([
    ['Василь Мороз', 0],
    ['Тарас Лисенко', 1],
  ]);
  pm.expect(items.map((i) => i.fullName)).to.not.include('Дмитро Савченко');
});
pm.test('only what the picker shows: id, name, priority', () => {
  items.forEach((i) =>
    pm
      .expect(Object.keys(i).sort())
      .to.deep.equal(['fullName', 'id', 'priority']),
  );
});
