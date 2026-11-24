pm.test('Крипто Team Leads only', () => {
  const page = pm.response.json();
  const names = page.items.map((i) => i.fullName);
  pm.expect(page.vertical.name).to.equal('Крипто');
  pm.expect(names).to.include('Дмитро Савченко');
  pm.expect(names).to.not.include('Василь Мороз');
  pm.expect(names).to.not.include('Тарас Лисенко');
});
