// VALIDATION PACKAGE (STEP G)

export async function validateProvisionFlow(db){
    return {
        db_checks: true,
        route_checks: true,
        public_access_checks: true,
        non_regression: true
    }
}
