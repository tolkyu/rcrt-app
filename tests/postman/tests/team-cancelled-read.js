const vacancy = pm.response.json();
pm.test(
  'everyone who reads the vacancy reads the reason; no team control is offered',
  () => {
    pm.expect(vacancy.status).to.equal('CANCELLED');
    pm.expect(vacancy.cancelReason).to.equal(
      'Потреба закрита\nТест API ' + pm.collectionVariables.get('vacancy_run'),
    );
    pm.expect(vacancy.statusActions).to.deep.equal([]);
    pm.expect(vacancy.canAssignRecruiters).to.equal(false);
    pm.expect(vacancy.canSetTeamLead).to.equal(false);
    pm.expect(vacancy.canSelfAssign).to.equal(false);
  },
);
