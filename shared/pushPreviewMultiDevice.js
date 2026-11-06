/**
 * Multiple opted-in devices with fixed mock school roles, Preview PR #46 only.
 * Room codes are random capabilities. This file has no Firebase access.
 */
import {TEST_RECEIVERS} from "./pushPreviewFixtures.js";
export const MAX_ROOM_MEMBERS=4;
export const ROOM_TTL_MS=24*60*60*1000;
export const MAX_ROOM_CREATES_PER_DAY=10;
export function validRoomCode(code){
  return typeof code==="string"&&/^[A-Za-z0-9_-]{24}$/.test(code);
}
export function validMockRole(role){
  return TEST_RECEIVERS.some(user=>user.id===role);
}
export function roomMemberList(room){
  return Array.isArray(room?.members)?room.members.slice(0,MAX_ROOM_MEMBERS):[];
}
export function eligibleRoomMembers(event,room){
  if(!event||!room)return [];
  return roomMemberList(room).filter(member=>
    member&&member.id!==room.ownerId&&
    typeof member.id==="string"&&/^[0-9a-f]{64}$/.test(member.id)&&
    validMockRole(member.role)&&event.recipientIds.includes(member.role)
  );
}
export function roomPublicMembers(room){
  const counts={};
  for(const member of roomMemberList(room)){
    if(validMockRole(member?.role))counts[member.role]=(counts[member.role]||0)+1;
  }
  return TEST_RECEIVERS.filter(r=>counts[r.id]).map(r=>({
    role:r.id,label:r.label,count:counts[r.id]
  }));
}
