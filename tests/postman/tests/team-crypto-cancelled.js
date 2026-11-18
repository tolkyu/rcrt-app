const vacancy = pm.response.json();
pm.test('the throwaway Крипто vacancy ends cancelled, with its reason', () => {
  pm.expect(vacancy.id).to.equal(pm.collectionVariables.get('team_c_id'));
  pm.expect(vacancy.status).to.equal('CANCELLED');
  pm.expect(vacancy.cancelReason).to.equal(
    'Тест API ' + pm.collectionVariables.get('vacancy_run'),
  );
});
