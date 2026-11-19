pm.test(
  'Finance session is aal2 with the seeded device, nothing withheld',
  () => {
    const status = pm.response.json();
    pm.expect(status.aal).to.equal('aal2');
    pm.expect(status.required).to.equal(false);
    pm.expect(status.factors).to.have.lengthOf(1);
    pm.expect(status.canAddFactor).to.equal(true);
  },
);
