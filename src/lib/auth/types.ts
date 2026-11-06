/** Usuário independente de provedor, usado pela interface e pela API. */
export type AuthUser = {
  id: string;
  email: string | null;
  fullName: string | null;
};
