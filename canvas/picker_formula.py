"""The people-picker Items formula shared by every ModernCombobox that searches Office 365 users.

Name/email search via SearchUser, plus an exact lookup when the text contains an @ — UAB sign-in
names (UPNs) often differ from email addresses, and SearchUser doesn't match UPNs. Rows carry
DisplayName, Mail, UserPrincipalName, Surname, GivenName and a PickerLabel that shows the sign-in
name when it differs from the email. Blank rows are dropped (with nothing typed both halves are
blank, and Ungroup turns two blanks into two empty rows).

  python3 picker_formula.py cmbAuUser 50     # print the formula for a control
"""
import sys


def picker_items(ctl, top=50):
    return f'''=With({{q: Trim({ctl}.SearchText)}},
    With({{found: If(Len(q) >= 2,
            ForAll(
                Filter(Office365Users.SearchUser({{searchTerm: q, top: {top}}}),
                    !IsBlank(Surname),
                    !StartsWith(DisplayName, "!"),
                    !IsBlank(Coalesce(Mail, UserPrincipalName))),
                {{DisplayName: DisplayName, Mail: Mail, UserPrincipalName: UserPrincipalName,
                 Surname: Surname, GivenName: GivenName}}))}},
        // A sign-in name (UPN) can differ from the email, and SearchUser doesn't match it:
        // when the text looks like an address nobody above has, look that exact account up too.
        With({{exact: If("@" in q && Len(q) > 3
                    && CountRows(Filter(found, Lower(UserPrincipalName) = Lower(q) || Lower(Mail) = Lower(q))) = 0,
                IfError(
                    With({{p: Office365Users.UserProfileV2(q)}},
                        If(IsBlank(p.surname), Blank(),
                            Table({{DisplayName: p.displayName, Mail: p.mail, UserPrincipalName: p.userPrincipalName,
                                   Surname: p.surname, GivenName: p.givenName}}))),
                    Blank()))}},
            AddColumns(
                Filter(Ungroup(Table({{rows: found}}, {{rows: exact}}), rows),
                    !IsBlank(Coalesce(Mail, UserPrincipalName))),
                PickerLabel,
                Surname & ", " & GivenName & "  ·  " & Coalesce(Mail, UserPrincipalName)
                    & If(!IsBlank(Mail) && Lower(UserPrincipalName) <> Lower(Mail),
                        "  ·  sign-in " & Lower(UserPrincipalName), "")))))'''


if __name__ == "__main__":
    print(picker_items(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 50))
