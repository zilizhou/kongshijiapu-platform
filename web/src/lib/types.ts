export type Role = "editor" | "first" | "second" | "final" | "admin";

export type RequestStatus =
  | "draft"
  | "pending_1"
  | "pending_2"
  | "pending_final"
  | "approved"
  | "rejected";

export type Operation = "create" | "update" | "delete" | "reorder";

/** 变更对象：家谱成员 / 派户支 / 待考成员 */
export type ObjectType = "people" | "branch" | "daikao";

export type SessionUser = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
};

/** 用户管理列表项（不含密码） */
export type AppUserRow = {
  id: string;
  username: string;
  displayName: string;
  role: Role;
  isActive: boolean;
  createdAt: string;
};

export type BranchRow = {
  id: number;
  book: string | null;
  flag: number;
  fullName: string;
  name: string;
  parentId: number | null;
  parentName: string | null;
  person: string | null;
  remark: string | null;
  volume: string | null;
  createTime: string | null;
  createUser: string | null;
  personParentId: number | null;
  personParentName: string | null;
  personParentNo: string | null;
  level: number | null;
  left: number;
  right: number;
  childCount?: number;
  operation?: string;
  reviewStatus?: string;
};

export type BranchPayload = {
  name: string;
  fullName?: string;
  parentId?: number | null;
  book?: string;
  person?: string;
  volume?: string;
  remark?: string;
  level?: number | null;
  personParentId?: number | null;
  personParentName?: string;
  personParentNo?: string;
};

export type PeoplePayload = {
  name: string;
  sex: "男" | "女";
  no?: string;
  level?: number | null;
  group?: string;
  birthday?: string;
  deathday?: string;
  address?: string;
  pinyin?: string;
  /** 其他别名（不含字/号） */
  alias?: string;
  /** 表字，如「子上」 */
  zi?: string;
  /** 号，如「存齋」 */
  hao?: string;
  nation?: string;
  isHeir?: "0" | "1";
  originalData?: "0" | "1";
  ancestralHome?: string;
  lngLat?: string;
  /** 联系电话，多个用顿号「、」分隔 */
  phone?: string;
  /** 身份证号码，15 或 18 位 */
  idCard?: string;
  parentId?: number | null;
  /** 终审落库时，将此人插入为该成员的父节点（并接管其原父） */
  asParentOf?: number | null;
  birthFatherId?: number | null;
  birthMother?: string;
  currentMother?: string;
  /** 长子/次子等排行（入库繁体） */
  rank?: string;
  /** 同父兄弟姊妹中的顺序，0=最左=长 */
  siblingOrder?: number | null;
  /** reorder 操作：同父下从左到右的子节点 ID 列表 */
  childIds?: number[];
  spouse?: string;
  spouseInfo?: string;
  description?: string;
  volume?: string;
  company?: string;
  position?: string;
  professionalTitle?: string;
  college?: string;
  degree?: string;
  /** 录入时间（对应 F_CREATE_TIME，可手改；格式 YYYY-MM-DD HH:mm:ss） */
  createTime?: string;
  /** 来源待考成员 ID；终审通过后回写待考入谱状态 */
  sourceDaikaoId?: number | null;
  /** 缴费状态；仅本平台新录入。paid=已交费，unpaid=未收费 */
  feeStatus?: "paid" | "unpaid";
};

export type PeopleRow = {
  id: number;
  name: string;
  sex: string;
  no: string | null;
  level: number | null;
  groupName: string | null;
  birthday: string | null;
  deathday: string | null;
  address: string | null;
  pinyin: string | null;
  alias: string | null;
  zi?: string | null;
  hao?: string | null;
  isHeir: string | null;
  originalData: string | null;
  lngLat: string | null;
  parentId: number | null;
  parentName: string | null;
  birthFatherId: number | null;
  birthFatherName?: string | null;
  rank?: string | null;
  siblingOrder?: number | null;
  spouse: string | null;
  spouseInfo: string | null;
  description: string | null;
  volume: string | null;
  phone: string | null;
  idCard?: string | null;
  company: string | null;
  position: string | null;
  professionalTitle: string | null;
  college: string | null;
  degree: string | null;
  nation?: string | null;
  ancestralHome?: string | null;
  birthMother?: string | null;
  currentMother?: string | null;
  /** 录入时间 */
  createTime: string | null;
  /** 创建人账号标记；platform=本平台新录，空=旧谱底库 */
  createAdmin: string | null;
  /** 缴费状态；旧谱为 null（筛选时视为已交费） */
  feeStatus?: "paid" | "unpaid" | null;
  /** 更新时间 */
  editTime: string | null;
  childCount?: number;
  /** 该人最新一条变更单状态；无变更单则为 null */
  reviewStatus?: string | null;
  reviewRequestId?: number | null;
};

export type LineageNode = {
  id: number;
  name: string;
  sex: string;
  no: string | null;
  level: number | null;
  spouse: string | null;
  rank?: string | null;
  children: LineageNode[];
  /** 未入库的待审新增节点 */
  pending?: boolean;
  requestId?: number;
  /** 旧谱仅有父名、未挂靠到具体人员（不可点开详情） */
  unresolved?: boolean;
};

export const ROLE_LABEL: Record<Role, string> = {
  editor: "录入员",
  first: "一审",
  second: "二审",
  final: "终审",
  admin: "管理员",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  draft: "暂存",
  pending_1: "待一审",
  pending_2: "待二审",
  pending_final: "待终审",
  approved: "已通过",
  rejected: "已驳回",
};

export const OP_LABEL: Record<Operation, string> = {
  create: "新增",
  update: "修改",
  delete: "删除",
  reorder: "调整排行",
};

export const OBJECT_TYPE_LABEL: Record<ObjectType, string> = {
  people: "家谱成员",
  branch: "派户支",
  daikao: "待考成员",
};

/** 待考入谱状态 */
export type DaikaoAdmitStatus = "none" | "pending" | "admitted";

/** 待考库人员（tb_daikao_people） */
export type DaikaoRow = {
  id: number;
  sourceFile: string;
  sourceLine: number;
  volume: string | null;
  sectionPath: string | null;
  isRoot: boolean;
  isOutHeir: boolean;
  name: string;
  spectrumNo: string | null;
  generation: number | null;
  generationLabel: string | null;
  groupRaw: string | null;
  group1: string | null;
  group2: string | null;
  group3: string | null;
  childrenSample: string | null;
  childrenWithNo: string | null;
  outHeirs: string | null;
  description: string | null;
  sex: string;
  spouse: string | null;
  address: string | null;
  parentId: number | null;
  parentName: string | null;
  parentNo: string | null;
  createdAt: string | null;
  admitStatus: DaikaoAdmitStatus;
  admitRequestId: number | null;
  admittedPeopleId: number | null;
  admittedAt: string | null;
  pinyin?: string | null;
  alias?: string | null;
  zi?: string | null;
  hao?: string | null;
  birthday?: string | null;
  deathday?: string | null;
  phone?: string | null;
  idCard?: string | null;
  nation?: string | null;
  ancestralHome?: string | null;
  lngLat?: string | null;
  spouseInfo?: string | null;
  company?: string | null;
  position?: string | null;
  professionalTitle?: string | null;
  college?: string | null;
  degree?: string | null;
  birthFatherId?: number | null;
  birthMother?: string | null;
  currentMother?: string | null;
  rank?: string | null;
  siblingOrder?: number | null;
  reviewStatus?: string | null;
  reviewRequestId?: number | null;
};

export type DaikaoUpdatePayload = {
  name?: string;
  spectrumNo?: string | null;
  generation?: number | null;
  generationLabel?: string | null;
  groupRaw?: string | null;
  group1?: string | null;
  group2?: string | null;
  group3?: string | null;
  childrenSample?: string | null;
  childrenWithNo?: string | null;
  outHeirs?: string | null;
  description?: string | null;
  sex?: string;
  spouse?: string | null;
  address?: string | null;
  volume?: string | null;
  sectionPath?: string | null;
  parentName?: string | null;
  parentNo?: string | null;
  isRoot?: boolean;
  isOutHeir?: boolean;
};

/** 变更单载荷：按 objectType 区分 */
export type ChangePayload = PeoplePayload | BranchPayload;

export type ChangeRequest = {
  id: number;
  objectType: ObjectType;
  objectId: number | null;
  operation: Operation;
  status: RequestStatus;
  payload: ChangePayload;
  beforeSnapshot: ChangePayload | null;
  rejectReason: string | null;
  submitterId: string;
  submitterName: string;
  lastActorId: string | null;
  lastActorName: string | null;
  createdAt: string;
  updatedAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
};
