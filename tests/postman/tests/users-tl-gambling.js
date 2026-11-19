pm.test('Team Leads holding the role in Гемблінг', () => {
  const { items } = pm.response.json();
  const gambling = pm.collectionVariables.get('gambling_id');
  const names = items.map((u) => u.fullName);
  pm.expect(names).to.include.members(['Василь Мороз', 'Тарас Лисенко']);
  pm.expect(names).to.not.include('Дмитро Савченко');
  items.forEach((u) => {
    const held = u.roles.some(
      (r) => r.role === 'TEAM_LEAD' && r.vertical && r.vertical.id === gambling,
    );
    pm.expect(held).to.equal(true);
  });
});
