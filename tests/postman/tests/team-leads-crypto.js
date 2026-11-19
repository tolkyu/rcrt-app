const names = pm.response.json().items.map((i) => i.fullName);
pm.test('Крипто Team Leads only', () => {
  pm.expect(names).to.include('Дмитро Савченко');
  pm.expect(names).to.not.include.members(['Василь Мороз', 'Тарас Лисенко']);
});
