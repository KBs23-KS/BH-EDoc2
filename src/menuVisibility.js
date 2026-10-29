/** Menu presentation only. Workflows and data access remain unchanged.
 * Director's document detail keeps its "เกษียณ / มอบหมายต่อ" button.
 * Deputy receives review/signature work under "งานที่ต้องดำเนินการ".
 */
export function shouldShowRoleMenu(menuId,role,hasManagedGroup=false) {
  if(menuId==="routing") return role==="admin" || (role!=="director" && Boolean(hasManagedGroup));
  if(menuId==="assignments" && (role==="director" || role==="deputy"))return false;
  return true;
}
