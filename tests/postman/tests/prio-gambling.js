const page = pm.response.json();
const names = page.items.map((i) => i.fullName);
pm.test('Гемблінг Team Leads only', () => {
  pm.expect(page.vertical.name).to.equal('Гемблінг');
  pm.expect(names).to.include.members(['Василь Мороз', 'Тарас Лисенко']);
  pm.expect(names).to.not.include('Дмитро Савченко');
});
pm.test('seeded priorities: Василь 0, Тарас 1', () => {
  const priority = (name) =>
    page.items.find((i) => i.fullName === name).priority;
  pm.expect(priority('Василь Мороз')).to.equal(0);
  pm.expect(priority('Тарас Лисенко')).to.equal(1);
});
const vasyl = page.items.find((i) => i.fullName === 'Василь Мороз');
pm.collectionVariables.set('prio_user_id', vasyl.userId);
pm.collectionVariables.set(
  'prio_changes',
  JSON.stringify(
    page.items.map((i) => ({
      userId: i.userId,
      priority: i.priority,
      version: i.version,
    })),
  ),
);
